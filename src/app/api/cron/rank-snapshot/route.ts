import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import {
  activeUserIds,
  rankBoard,
  pacificDate,
  type Board,
} from "@/lib/leaderboard";
import type { Bet, LeaderboardRow, Match } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 每日太平洋时间 0:00 跑：把当前两个榜（毒奶/收成）的排名各存一份快照。
 * 排行榜页据此显示「相对上一份快照（≈昨天收盘）」的名次升降。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [
    { data: rows, error: rErr },
    { data: bets, error: bErr },
    { data: matches, error: mErr },
  ] = await Promise.all([
    supabase.from("leaderboard").select("*"),
    supabase
      .from("bets")
      .select("user_id, match_id, status, created_at, updated_at"),
    supabase.from("matches").select("id, commence_time"),
  ]);
  if (rErr || bErr || mErr) {
    return NextResponse.json(
      { error: (rErr ?? bErr ?? mErr)?.message },
      { status: 500 },
    );
  }

  const active = activeUserIds(
    (bets ?? []) as Bet[],
    (matches ?? []) as Match[],
  );
  const hasBet = (id: string) => active.has(id);
  const day = pacificDate();

  const snapshots: { user_id: string; board: Board; rank: number; day: string }[] =
    [];
  for (const board of ["milk", "profit"] as Board[]) {
    const ranked = rankBoard((rows ?? []) as LeaderboardRow[], hasBet, board);
    ranked.forEach((e, i) =>
      snapshots.push({ user_id: e.row.id, board, rank: i + 1, day }),
    );
  }

  if (snapshots.length > 0) {
    const { error } = await supabase
      .from("rank_snapshots")
      .upsert(snapshots, { onConflict: "user_id,board,day" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, day, snapshots: snapshots.length });
}
