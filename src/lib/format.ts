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

/** 净收益文案（收到 − 押注）。正=赚、负=亏；无已结算注单时为 null。 */
export function formatProfit(net: number | null): string {
  if (net == null) return "暂无";
  return `${net > 0 ? "+" : ""}${net}`;
}

/** 毒奶指数文案：猜错率（猜错场次 ÷ 已结算场次），如 "60%"。无已结算注单时为 null。 */
export function formatLossRate(rate: number | null): string {
  if (rate == null) return "暂无";
  return `${Math.round(rate * 100)}%`;
}

/** 比赛日期 key（按用户本地时区分组），如 "6月11日 周三"。 */
export function matchDateKey(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(iso));
}

/** 「上次结算检查时间」展示：本地时区 月日 + HH:mm，如 "6月12日 14:30"。 */
export function settleRunLabel(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
