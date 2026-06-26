import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getKnockoutFixtures, type KnockoutFixture } from "@/lib/openfootball";
import { getAdvanceProb } from "@/lib/polymarketApi";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 队名归一化，用于 openfootball ↔ teams 表匹配（与 polymarketApi 同口径）。 */
function canon(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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

  // teams：canon(name_en) → { id, name_en }
  const { data: teamRows } = await supabase.from("teams").select("id, name_en");
  const teamByName = new Map<string, { id: number; nameEn: string }>();
  for (const t of teamRows ?? []) {
    teamByName.set(canon(t.name_en), { id: t.id as number, nameEn: t.name_en });
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

  return NextResponse.json({
    ok: true,
    fixtures: fixtures.length,
    withOdds: withOdds.length,
    skippedNoProb,
    skippedUnknownTeam,
  });
}
