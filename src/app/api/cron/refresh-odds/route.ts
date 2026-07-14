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
import { activeUserIds } from "@/lib/leaderboard";
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

/**
 * 「胡萝卜王」盘：选项 = 参与过的用户，赔率按当前净胡萝卜（收成榜）每天更新。
 * 选项不来自 Polymarket；结算为手动（世界杯结束后设定 result_outcome_id）。
 */
const CARROT_KING = {
  id: "bobocup-carrot-king",
  title: "胡萝卜王 · 谁最后收成最多",
  kind: "carrot_king",
  outcome_label: "选手",
} as const;

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

  let carrotKing: unknown = null;
  try {
    carrotKing = await refreshCarrotKing(supabase);
  } catch (e) {
    carrotKing = { error: String(e instanceof Error ? e.message : e) };
  }

  return NextResponse.json({
    ok: true,
    fixtures: fixtures.length,
    withOdds: withOdds.length,
    skippedNoProb,
    skippedUnknownTeam,
    outright,
    daily,
    carrotKing,
  });
}

// ── 每日竞猜（已下线）：不再选新题，仅继续结算历史遗留的已 featured 每日题 ──

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
  // 每日竞猜已下线：不再挑选新题；只继续刷新/结算历史上「已 featured 且未结算」的每日题，
  // 避免早先下过的每日注单永远晾在 pending。
  const { data: featured } = await supabase
    .from("outright_markets")
    .select("id")
    .eq("kind", "daily")
    .not("featured_date", "is", null)
    .eq("settled", false);
  let settled = 0;
  for (const m of featured ?? []) {
    try {
      const live = await getDailyMarket(m.id as string);
      await upsertDailyOutcomes(supabase, m.id as string, live);
      if (live.resolved && live.winnerName) {
        await settleDaily(supabase, m.id as string, live.winnerName);
        settled++;
      }
    } catch {
      /* 单题失败不影响其它 */
    }
  }
  return { retired: true, settledFeatured: settled };
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

/**
 * 净胡萝卜 → 夺魁概率（softmax）。
 *  - 温度随分差自适应：早期大家都接近 0 时接近均匀分布；分差拉开后才拉开赔率。
 *  - 下限 300 防止过尖；单人概率封顶 0.9，避免退化成 1.00。
 */
export function carrotSoftmax(nets: number[]): number[] {
  const n = nets.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const mean = nets.reduce((s, x) => s + x, 0) / n;
  const std = Math.sqrt(
    nets.reduce((s, x) => s + (x - mean) ** 2, 0) / n,
  );
  const T = Math.max(300, std);
  const mx = Math.max(...nets);
  const weights = nets.map((x) => Math.exp((x - mx) / T));
  const sum = weights.reduce((s, w) => s + w, 0);
  let probs = weights.map((w) => w / sum);
  // 安全封顶：任一选项不超过 0.9，超出部分按比例分给其余选项
  const CAP = 0.9;
  const over = probs.findIndex((p) => p > CAP);
  if (over >= 0) {
    const others = probs.reduce((s, p, i) => (i === over ? s : s + p), 0) || 1;
    probs = probs.map((p, i) =>
      i === over ? CAP : (1 - CAP) * (p / others),
    );
  }
  return probs;
}

/**
 * 刷新「胡萝卜王」盘：
 *  - upsert 盘元数据；已结算则跳过（不再改赔率）。
 *  - 选项 = 当前在收成榜上的玩家（activeUserIds：近 3 天有投注/结算，或已开赛比赛覆盖 >50%）。
 *  - 赔率 = softmax(净胡萝卜) 的公平赔率。
 *  - 已掉出榜单、且没人押过的旧选项会被清掉（有人押过的保留并置灰，保证结算完整）。
 */
async function refreshCarrotKing(
  supabase: ReturnType<typeof createAdminClient>,
) {
  const nowIso = new Date().toISOString();

  await supabase.from("outright_markets").upsert(
    {
      id: CARROT_KING.id,
      title: CARROT_KING.title,
      kind: CARROT_KING.kind,
      outcome_label: CARROT_KING.outcome_label,
      updated_at: nowIso,
    },
    { onConflict: "id" },
  );

  const { data: mkt } = await supabase
    .from("outright_markets")
    .select("settled")
    .eq("id", CARROT_KING.id)
    .maybeSingle();
  if (mkt?.settled) return "already settled";

  // 收成榜聚合 + 活跃判定所需的比赛注单/赛程
  const [{ data: lb }, { data: bets }, { data: matches }] = await Promise.all([
    supabase
      .from("leaderboard")
      .select("id, nickname, total_staked, total_returned"),
    supabase
      .from("bets")
      .select("user_id, match_id, status, created_at, updated_at"),
    supabase.from("matches").select("id, commence_time"),
  ]);

  // 与收成榜完全一致：只保留「现在在排行榜上」的玩家
  const active = activeUserIds(bets ?? [], matches ?? []);
  const players = (lb ?? []).filter((r) => active.has(r.id as string));
  const keepNames = new Set(players.map((r) => r.id as string));

  const nets = players.map(
    (r) => Number(r.total_returned ?? 0) - Number(r.total_staked ?? 0),
  );
  const probs = carrotSoftmax(nets);

  // 概率从高到低定 sort_order
  const order = players
    .map((_, i) => i)
    .sort((a, b) => probs[b] - probs[a]);
  const rows = order.map((pi, i) => {
    const p = probs[pi];
    return {
      market_id: CARROT_KING.id,
      name: players[pi].id as string, // user_id
      name_zh: (players[pi].nickname as string) ?? "神秘人",
      team_id: null,
      prob: p,
      odds: p > 0 ? Math.round((1 / p) * 100) / 100 : null,
      image_url: null,
      sort_order: i,
      closed: false,
      updated_at: nowIso,
    };
  });
  if (rows.length > 0) {
    const { error } = await supabase
      .from("outright_outcomes")
      .upsert(rows, { onConflict: "market_id,name" });
    if (error) throw new Error(`carrot_king outcomes: ${error.message}`);
  }

  // 清理已掉出榜单的旧选项：没人押过的直接删，有人押过的置灰保留
  const [{ data: existing }, { data: placed }] = await Promise.all([
    supabase
      .from("outright_outcomes")
      .select("id, name")
      .eq("market_id", CARROT_KING.id),
    supabase
      .from("outright_bets")
      .select("outcome_id")
      .eq("market_id", CARROT_KING.id),
  ]);
  const betOutcomeIds = new Set(
    (placed ?? []).map((b) => b.outcome_id as number),
  );
  const staleDelete: number[] = [];
  const staleClose: number[] = [];
  for (const o of existing ?? []) {
    if (keepNames.has(o.name as string)) continue;
    if (betOutcomeIds.has(o.id as number)) staleClose.push(o.id as number);
    else staleDelete.push(o.id as number);
  }
  if (staleDelete.length > 0) {
    await supabase.from("outright_outcomes").delete().in("id", staleDelete);
  }
  if (staleClose.length > 0) {
    await supabase
      .from("outright_outcomes")
      .update({ closed: true, updated_at: nowIso })
      .in("id", staleClose);
  }

  return {
    outcomes: rows.length,
    removed: staleDelete.length,
    closed: staleClose.length,
  };
}
