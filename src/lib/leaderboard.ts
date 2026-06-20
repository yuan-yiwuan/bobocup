import type { LeaderboardRow } from "./types";

export type Board = "milk" | "profit";

/** 单个用户的榜单派生数据。 */
export interface Enriched {
  row: LeaderboardRow;
  settled: number;
  lost: number;
  /** 猜错率（毒奶指数），无已结算注单时为 null。 */
  lossRate: number | null;
  /** 净收益（收到 − 押注），无已结算注单时为 null。 */
  profit: number | null;
}

export function enrichRow(row: LeaderboardRow): Enriched {
  const settled = row.settled_bets;
  const lost = settled - row.won_bets;
  return {
    row,
    settled,
    lost,
    lossRate: settled > 0 ? lost / settled : null,
    profit: settled > 0 ? row.total_returned - row.total_staked : null,
  };
}

/**
 * 把 leaderboard 视图的行按某个榜排序，只保留「投过注」的人。
 * 排序与 UI 完全一致；末尾用 user id 兜底，保证排名在两次快照间稳定可比。
 */
export function rankBoard(
  rows: LeaderboardRow[],
  hasBet: (id: string) => boolean,
  board: Board,
): Enriched[] {
  const enriched = rows.filter((r) => hasBet(r.id)).map(enrichRow);
  const key = (e: Enriched) => (board === "milk" ? e.lossRate : e.profit);
  return enriched.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka == null && kb == null) return tieBreak(a, b, board);
    if (ka == null) return 1;
    if (kb == null) return -1;
    if (kb !== ka) return kb - ka;
    return tieBreak(a, b, board);
  });
}

function tieBreak(a: Enriched, b: Enriched, board: Board): number {
  // 毒奶榜同率时，猜错场次多的更毒
  if (board === "milk" && b.lost !== a.lost) return b.lost - a.lost;
  // 最终按 user id 稳定排序，让每日快照的排名可比
  return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
}

/** 太平洋时区当天日期，格式 YYYY-MM-DD。 */
export function pacificDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
