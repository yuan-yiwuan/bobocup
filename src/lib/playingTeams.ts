import type { SupabaseClient } from "@supabase/supabase-js";
import type { Team } from "./types";

/**
 * 只返回"真正参赛"的球队 —— 即在 matches 表里出现过的（约 48 支），
 * 用于 onboarding / 设置里选主队，过滤掉 seed 里多余的国家队。
 */
export async function getPlayingTeams(
  supabase: SupabaseClient,
): Promise<Team[]> {
  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from("teams").select("*").order("name_zh"),
    supabase.from("matches").select("home_team_id, away_team_id"),
  ]);

  const ids = new Set<number>();
  for (const m of matches ?? []) {
    if (m.home_team_id) ids.add(m.home_team_id);
    if (m.away_team_id) ids.add(m.away_team_id);
  }

  const all = (teams ?? []) as Team[];
  const playing = all.filter((t) => ids.has(t.id));
  // 兜底：万一 matches 还没灌数据，就退回全部，避免空选项
  return playing.length > 0 ? playing : all;
}
