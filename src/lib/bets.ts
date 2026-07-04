import type { Match, Pick } from "./types";

/** 某个投注项对应的赔率。 */
export function pickOdds(match: Match, pick: Pick): number | null {
  if (pick === "home") return match.odds_home;
  if (pick === "draw") return match.odds_draw;
  return match.odds_away;
}

/**
 * 用户的主队在这场比赛里对应哪个投注项（主队踢主场=home，踢客场=away）。
 * 主队没参加这场则返回 null —— 用于判断能否多倍下注。
 */
export function homeTeamPick(
  match: Match,
  userHomeTeamId: number | null,
): Pick | null {
  if (userHomeTeamId == null) return null;
  if (match.home_team_id === userHomeTeamId) return "home";
  if (match.away_team_id === userHomeTeamId) return "away";
  return null;
}

/** 比赛是否已开赛（开赛后不可下注/改注/取消）。 */
export function hasStarted(match: Match): boolean {
  return new Date(match.commence_time).getTime() <= Date.now();
}

/** 把数据库报错转成中文提示（统一用「竞猜」措辞）。 */
export function humanizeBetError(message: string): string {
  if (message.includes("已开赛")) return "比赛已开赛，无法操作";
  if (message.includes("主队"))
    return "只有自己主队的比赛才能投 3 倍以上（其它比赛最多 2 倍）";
  if (message.includes("不合法") || message.includes("1~3 倍"))
    return "竞猜额不合法";
  if (message.includes("分晓")) return "该竞猜已揭晓，无法竞猜";
  if (message.includes("出局")) return "该选项已出局，换一个吧";
  if (message.includes("不可修改")) return "该竞猜已锁定，不可修改";
  return message;
}

export const PICK_TEXT: Record<Pick, string> = {
  home: "主胜",
  draw: "平局",
  away: "客胜",
};
