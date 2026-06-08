import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUpcomingMatches } from "@/lib/oddsApi";
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

  // Upsert 比赛（不覆盖已 finished 的比赛的结果字段）
  const now = new Date().toISOString();
  const rows = matches.map((m) => ({
    id: m.id,
    home_team_id: teamId.get(m.homeTeam.trim().toLowerCase()) ?? null,
    away_team_id: teamId.get(m.awayTeam.trim().toLowerCase()) ?? null,
    home_team_name: m.homeTeam,
    away_team_name: m.awayTeam,
    commence_time: m.commenceTime,
    odds_home: m.oddsHome,
    odds_draw: m.oddsDraw,
    odds_away: m.oddsAway,
    odds_updated_at: now,
  }));

  const { error: upsertErr } = await supabase
    .from("matches")
    .upsert(rows, { onConflict: "id" });
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    matches: rows.length,
    newTeams: toInsert.length,
  });
}
