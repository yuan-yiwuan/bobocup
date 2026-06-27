import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getKnockoutFixtures, type KnockoutFixture } from "@/lib/openfootball";
import {
  getAdvanceProb,
  getOutrightMarket,
  getDailyMarket,
  OUTRIGHT_SLUGS,
  type DailyMarket,
} from "@/lib/polymarketApi";
import { isAuthorizedCron } from "@/lib/cron";
import { teamKey } from "@/lib/teamNames";
import { pacificDate } from "@/lib/leaderboard";
import { STAKE } from "@/lib/types";

type TeamInfo = { id: number; nameEn: string; nameZh: string };

/** 要维护的长期盘（金靴 / 夺冠）。 */
const OUTRIGHTS = [
  {
    id: OUTRIGHT_SLUGS.golden_boot,
    title: "金靴（最佳射手）",
    kind: "golden_boot",
    outcome_label: "球员",
  },
  {
    id: OUTRIGHT_SLUGS.champion,
    title: "夺冠球队",
    kind: "champion",
    outcome_label: "球队",
  },
] as const;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 队名归一化（openfootball / Polymarket / teams 三方对齐），统一走 teamKey。 */
const canon = teamKey;

/** 晋级概率 → 小数赔率（去水后的「公平」赔率），保留两位。 */
function probToOdds(p: number): number {
  return Math.round((1 / p) * 100) / 100;
}

/**
 * 每日刷新（淘汰赛）：
 *  - 赛程/对阵：openfootball（只取双方都是真队名的场次，占位的跳过）
 *  - 晋级概率→赔率：Polymarket reach-stage 盘，双方归一化
 *  - 只处理尚未开赛的场次；拿不到概率的只写身份、保留旧赔率（下次重试）
 * 不再使用 the-odds-api。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let fixtures: KnockoutFixture[];
  try {
    fixtures = await getKnockoutFixtures();
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }

  // teams：canon(name_en) → { id, name_en, name_zh }
  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name_en, name_zh");
  const teamByName = new Map<string, TeamInfo>();
  for (const t of teamRows ?? []) {
    teamByName.set(canon(t.name_en), {
      id: t.id as number,
      nameEn: t.name_en,
      nameZh: t.name_zh as string,
    });
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();

  interface Row {
    id: string;
    home_team_id: number;
    away_team_id: number;
    home_team_name: string;
    away_team_name: string;
    commence_time: string;
    bet_type: "advance";
    odds_home?: number;
    odds_away?: number;
    odds_draw?: null;
    odds_updated_at?: string;
  }

  const withOdds: Row[] = [];
  const withoutOdds: Row[] = [];
  let skippedUnknownTeam = 0;
  let skippedNoProb = 0;

  for (const f of fixtures) {
    // 只处理尚未开赛、时间可解析的场次
    if (!f.commenceTime || new Date(f.commenceTime).getTime() <= now) continue;

    const home = teamByName.get(canon(f.team1));
    const away = teamByName.get(canon(f.team2));
    if (!home || !away) {
      skippedUnknownTeam++;
      continue;
    }

    const identity: Row = {
      id: f.id,
      home_team_id: home.id,
      away_team_id: away.id,
      home_team_name: home.nameEn,
      away_team_name: away.nameEn,
      commence_time: f.commenceTime,
      bet_type: "advance",
    };

    // 晋级概率（拿不到则只写身份，保留上次赔率）
    let probs = null;
    try {
      probs = await getAdvanceProb(home.nameEn, away.nameEn, f.round);
    } catch {
      probs = null;
    }
    if (probs) {
      withOdds.push({
        ...identity,
        odds_home: probToOdds(probs.a.prob),
        odds_away: probToOdds(probs.b.prob),
        odds_draw: null,
        odds_updated_at: nowIso,
      });
    } else {
      skippedNoProb++;
      withoutOdds.push(identity);
    }
  }

  if (withOdds.length > 0) {
    const { error } = await supabase
      .from("matches")
      .upsert(withOdds, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (withoutOdds.length > 0) {
    // 不含赔率列：已存在行的赔率不被触碰（保留旧值）
    const { error } = await supabase
      .from("matches")
      .upsert(withoutOdds, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // ── 长期盘（金靴/夺冠）：刷新概率/倍数 + Polymarket 结果结算 ──
  // 与淘汰赛刷新隔离：outright 表/接口出问题不应拖垮赛程刷新。
  let outright: unknown = null;
  try {
    outright = await refreshOutrights(supabase, teamByName);
  } catch (e) {
    outright = { error: String(e instanceof Error ? e.message : e) };
  }

  let daily: unknown = null;
  try {
    daily = await refreshDaily(supabase);
  } catch (e) {
    daily = { error: String(e instanceof Error ? e.message : e) };
  }

  return NextResponse.json({
    ok: true,
    fixtures: fixtures.length,
    withOdds: withOdds.length,
    skippedNoProb,
    skippedUnknownTeam,
    outright,
    daily,
  });
}

// ── 每日竞猜：刷新/结算已选题 + 挑选今天的 ───────────────────────

// 类别权重（越大越易被选）；其它/未分类给低权重。
const CATEGORY_WEIGHT: Record<string, number> = {
  trump: 6,
  culture: 6,
  player_h2h: 4,
  player_futures: 3,
  tournament_futures: 3,
  team_props: 2,
  stage_elim: 1,
};

/** 单题权重 = 类别权重 × 热度权重（热度用 log 压缩成交量量级差）。 */
function poolWeight(category: string | null, volume: number): number {
  const cat = CATEGORY_WEIGHT[category ?? ""] ?? 0.5;
  const pop = Math.log10((volume || 0) + 10); // ~1（$0）到 ~7（$1000万）
  return cat * pop;
}

/**
 * 加权随机排序（Efraimidis–Spirakis）：key = u^(1/weight)，按 key 降序。
 * 权重高的更可能排前，但保留随机性，每天结果不同。
 */
function weightedOrder<T extends { category: string | null; volume: number }>(
  rows: T[],
): T[] {
  return rows
    .map((r) => ({
      r,
      key: Math.pow(
        Math.random(),
        1 / Math.max(poolWeight(r.category, r.volume), 1e-6),
      ),
    }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.r);
}

/** 把一个每日盘的选项写库（概率/倍数/是否出局），Yes/No 映射成是/否。 */
async function upsertDailyOutcomes(
  supabase: ReturnType<typeof createAdminClient>,
  marketId: string,
  live: DailyMarket,
) {
  const now = new Date().toISOString();
  const rows = live.outcomes.map((o, i) => {
    const lower = o.name.toLowerCase();
    return {
      market_id: marketId,
      name: o.name,
      name_zh: lower === "yes" ? "是" : lower === "no" ? "否" : null,
      prob: o.prob,
      odds: o.prob > 0 ? Math.round((1 / o.prob) * 100) / 100 : null,
      image_url: o.image,
      sort_order: i,
      closed: o.closed,
      updated_at: now,
    };
  });
  if (rows.length > 0) {
    await supabase
      .from("outright_outcomes")
      .upsert(rows, { onConflict: "market_id,name" });
  }
}

/** 揭晓后结算某每日盘的注单。 */
async function settleDaily(
  supabase: ReturnType<typeof createAdminClient>,
  marketId: string,
  winnerName: string,
) {
  const { data: win } = await supabase
    .from("outright_outcomes")
    .select("id")
    .eq("market_id", marketId)
    .eq("name", winnerName)
    .maybeSingle();
  if (!win) return 0;
  const winnerId = win.id as number;
  const { data: bets } = await supabase
    .from("outright_bets")
    .select("id, outcome_id, stake, odds_snapshot")
    .eq("market_id", marketId)
    .eq("status", "pending");
  let n = 0;
  for (const bet of bets ?? []) {
    const won = bet.outcome_id === winnerId;
    const payout = won ? Math.round((bet.stake ?? STAKE) * (bet.odds_snapshot ?? 1)) : 0;
    await supabase
      .from("outright_bets")
      .update({ status: won ? "won" : "lost", payout })
      .eq("id", bet.id);
    n++;
  }
  await supabase
    .from("outright_markets")
    .update({
      settled: true,
      result_outcome_id: winnerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", marketId);
  return n;
}

async function refreshDaily(supabase: ReturnType<typeof createAdminClient>) {
  const today = pacificDate();
  const summary: Record<string, unknown> = {};

  // 1) 刷新 + 结算「已 featured 且未结算」的每日题
  const { data: featured } = await supabase
    .from("outright_markets")
    .select("id")
    .eq("kind", "daily")
    .not("featured_date", "is", null)
    .eq("settled", false);
  for (const m of featured ?? []) {
    try {
      const live = await getDailyMarket(m.id as string);
      await upsertDailyOutcomes(supabase, m.id as string, live);
      if (live.resolved && live.winnerName) {
        await settleDaily(supabase, m.id as string, live.winnerName);
      }
    } catch {
      /* 单题失败不影响其它 */
    }
  }

  // 2) 今天已选则跳过
  const { data: todays } = await supabase
    .from("outright_markets")
    .select("id")
    .eq("kind", "daily")
    .eq("featured_date", today)
    .limit(1);
  if ((todays?.length ?? 0) > 0) {
    summary.featured = todays![0].id;
    return summary;
  }

  // 3) 从池子挑一个：类别×热度加权随机排序，过滤掉已结束 / 有选项 >80%
  const { data: poolRows } = await supabase
    .from("outright_markets")
    .select("id, category, volume")
    .eq("kind", "daily")
    .eq("pool", true)
    .eq("closed", false)
    .is("featured_date", null)
    .eq("settled", false);
  const sorted = weightedOrder(
    (poolRows ?? []).map((r) => ({
      id: r.id as string,
      category: r.category as string | null,
      volume: Number(r.volume ?? 0),
    })),
  );

  let tries = 0;
  for (const row of sorted) {
    if (tries >= 30) break;
    tries++;
    let live: DailyMarket;
    try {
      live = await getDailyMarket(row.id as string);
    } catch {
      continue;
    }
    if (live.resolved || live.closed || live.outcomes.length === 0) {
      await supabase
        .from("outright_markets")
        .update({ closed: true })
        .eq("id", row.id as string);
      continue;
    }
    if (live.maxProb > 0.8) continue; // 今天太一边倒，留着以后
    await upsertDailyOutcomes(supabase, row.id as string, live);
    await supabase
      .from("outright_markets")
      .update({ featured_date: today, title: live.title })
      .eq("id", row.id as string);
    summary.picked = row.id;
    return summary;
  }
  summary.picked = null;
  return summary;
}

/**
 * 刷新金靴/夺冠两个长期盘：
 *  - upsert 盘 + 各候选项（概率/倍数/图片/是否出局），夺冠项关联球队。
 *  - 若 Polymarket 已分晓（某项 closed 且 Yes≈1），结算该盘的所有注单。
 *  已结算的盘跳过（不再刷新）。
 */
async function refreshOutrights(
  supabase: ReturnType<typeof createAdminClient>,
  teamByName: Map<string, TeamInfo>,
) {
  const nowIso = new Date().toISOString();
  const summary: Record<string, unknown> = {};

  for (const cfg of OUTRIGHTS) {
    // 盘元数据 upsert（不碰 settled / result_outcome_id）
    await supabase.from("outright_markets").upsert(
      {
        id: cfg.id,
        title: cfg.title,
        kind: cfg.kind,
        outcome_label: cfg.outcome_label,
        updated_at: nowIso,
      },
      { onConflict: "id" },
    );

    // 已结算的盘不再刷新
    const { data: mkt } = await supabase
      .from("outright_markets")
      .select("settled")
      .eq("id", cfg.id)
      .maybeSingle();
    if (mkt?.settled) {
      summary[cfg.kind] = "already settled";
      continue;
    }

    const market = await getOutrightMarket(cfg.id);

    // upsert 候选项
    const rows = market.outcomes.map((o, i) => {
      const team =
        cfg.kind === "champion" ? teamByName.get(canon(o.name)) : undefined;
      return {
        market_id: cfg.id,
        name: o.name,
        name_zh: team?.nameZh ?? null,
        team_id: team?.id ?? null,
        prob: o.prob,
        odds: o.prob > 0 ? Math.round((1 / o.prob) * 100) / 100 : null,
        image_url: o.image,
        sort_order: i,
        closed: o.closed,
        updated_at: nowIso,
      };
    });
    if (rows.length > 0) {
      const { error } = await supabase
        .from("outright_outcomes")
        .upsert(rows, { onConflict: "market_id,name" });
      if (error) throw new Error(`${cfg.kind} outcomes: ${error.message}`);
    }

    // 结算
    if (market.resolved && market.winnerName) {
      const { data: winRow } = await supabase
        .from("outright_outcomes")
        .select("id")
        .eq("market_id", cfg.id)
        .eq("name", market.winnerName)
        .maybeSingle();
      if (winRow) {
        const winnerId = winRow.id as number;
        const { data: bets } = await supabase
          .from("outright_bets")
          .select("id, outcome_id, stake, odds_snapshot")
          .eq("market_id", cfg.id)
          .eq("status", "pending");
        let settledBets = 0;
        for (const bet of bets ?? []) {
          const won = bet.outcome_id === winnerId;
          const odds = bet.odds_snapshot ?? 1;
          const stake = bet.stake ?? STAKE;
          const payout = won ? Math.round(stake * odds) : 0;
          const { error } = await supabase
            .from("outright_bets")
            .update({ status: won ? "won" : "lost", payout })
            .eq("id", bet.id);
          if (error) throw new Error(`${cfg.kind} settle: ${error.message}`);
          settledBets++;
        }
        await supabase
          .from("outright_markets")
          .update({ settled: true, result_outcome_id: winnerId, updated_at: nowIso })
          .eq("id", cfg.id);
        summary[cfg.kind] = { settled: true, winner: market.winnerName, settledBets };
        continue;
      }
    }
    summary[cfg.kind] = { outcomes: rows.length, resolved: market.resolved };
  }

  return summary;
}
