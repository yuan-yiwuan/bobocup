import type { Match, Pick, Team } from "./types";

export type TeamMap = Record<number, Team>;

/** 比赛某一方的展示文案（国旗 + 中文名），回退到 API 英文名。 */
export function sideLabel(
  match: Match,
  side: "home" | "away",
  teams: TeamMap,
): string {
  const id = side === "home" ? match.home_team_id : match.away_team_id;
  const fallback = side === "home" ? match.home_team_name : match.away_team_name;
  const team = id != null ? teams[id] : undefined;
  if (team) return `${team.flag_emoji ?? "⚽"} ${team.name_zh}`;
  return `⚽ ${fallback}`;
}

/** 某个投注选项的文案。 */
export function pickLabel(match: Match, pick: Pick, teams: TeamMap): string {
  if (pick === "draw") return "平局";
  return sideLabel(match, pick, teams);
}

export function formatOdds(odds: number | null): string {
  return odds == null ? "—" : odds.toFixed(2);
}

/** 毒奶指数文案。 */
export function formatMilk(index: number | null): string {
  if (index == null) return "暂无";
  return `${index > 0 ? "+" : ""}${index}%`;
}

/** 比赛日期 key（按用户本地时区分组），如 "6月11日 周三"。 */
export function matchDateKey(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(iso));
}

/** 比赛开球时间（用户本地时区 HH:mm）。 */
export function matchTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
