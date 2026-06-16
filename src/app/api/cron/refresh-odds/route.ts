import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUpcomingMatches, type UpcomingMatch } from "@/lib/oddsApi";
import { lookupTeam } from "@/lib/teamNames";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 每日刷新：从 the-odds-api 拉未开赛比赛 + 赔率，按需建球队，upsert 比赛。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let matches;
  try {
    matches = await getUpcomingMatches();
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }

  // 现有球队：lower(name_en) → id
  const { data: existing } = await supabase
    .from("teams")
    .select("id, name_en");
  const teamId = new Map<string, number>();
  for (const t of existing ?? []) {
    teamId.set(t.name_en.trim().toLowerCase(), t.id as number);
  }

  // 收集 API 中出现但库里没有的球队，插入
  const seen = new Set<string>();
  const toInsert: { name_zh: string; name_en: string; flag_emoji: string }[] =
    [];
  for (const m of matches) {
    for (const name of [m.homeTeam, m.awayTeam]) {
      const key = name.trim().toLowerCase();
      if (teamId.has(key) || seen.has(key)) continue;
      seen.add(key);
      const info = lookupTeam(name);
      toInsert.push({ name_zh: info.zh, name_en: name, flag_emoji: info.flag });
    }
  }
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("teams")
      .insert(toInsert)
      .select("id, name_en");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const t of inserted ?? []) {
      teamId.set(t.name_en.trim().toLowerCase(), t.id as number);
    }
  }

  // Upsert 比赛（不覆盖已 finished 的比赛的结果字段）。
  // 拿到合理赔率的才写赔率列；本轮没有合理赔率的（缺盘口 / 被合理性检查拦下），
  // 只更新身份与开赛时间，保留上一次的好赔率 —— 否则上游偶发错价会把可下注的
  // 好赔率冲成空，而 refresh 每天只跑一次，冲掉代价很大。
  const now = new Date().toISOString();
  const identity = (m: UpcomingMatch) => ({
    id: m.id,
    home_team_id: teamId.get(m.homeTeam.trim().toLowerCase()) ?? null,
    away_team_id: teamId.get(m.awayTeam.trim().toLowerCase()) ?? null,
    home_team_name: m.homeTeam,
    away_team_name: m.awayTeam,
    commence_time: m.commenceTime,
  });

  const hasOdds = (m: UpcomingMatch) =>
    m.oddsHome != null && m.oddsDraw != null && m.oddsAway != null;
  const withOdds = matches.filter(hasOdds);
  const withoutOdds = matches.filter((m) => !hasOdds(m));

  if (withOdds.length > 0) {
    const { error } = await supabase.from("matches").upsert(
      withOdds.map((m) => ({
        ...identity(m),
        odds_home: m.oddsHome,
        odds_draw: m.oddsDraw,
        odds_away: m.oddsAway,
        odds_updated_at: now,
      })),
      { onConflict: "id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  if (withoutOdds.length > 0) {
    // 不含赔率列的 upsert：已存在的行其赔率不被触碰（保留旧值）。
    const { error } = await supabase
      .from("matches")
      .upsert(withoutOdds.map(identity), { onConflict: "id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    matches: matches.length,
    withOdds: withOdds.length,
    skippedOdds: withoutOdds.length,
    newTeams: toInsert.length,
  });
}
