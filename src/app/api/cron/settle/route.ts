import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinishedMatches } from "@/lib/oddsApi";
import { isAuthorizedCron } from "@/lib/cron";
import { STAKE, type Match, type Pick } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function oddsForPick(match: Match, pick: Pick): number | null {
  if (pick === "home") return match.odds_home;
  if (pick === "draw") return match.odds_draw;
  return match.odds_away;
}

/**
 * 每日结算：拉最近已结束比赛比分，标记 finished 并结算尚未结算的注单。
 * - 猜中：payout = round(STAKE × 该选项赔率)，status = won
 * - 猜错：payout = 0，status = lost
 * - odds_snapshot 记录结算时锁定的赔率
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let finished;
  try {
    finished = await getFinishedMatches(3);
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 },
    );
  }
  if (finished.length === 0) {
    return NextResponse.json({ ok: true, settledMatches: 0, settledBets: 0 });
  }

  const byId = new Map(finished.map((f) => [f.id, f]));

  // 只处理库里有、且尚未结算的比赛
  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select("*")
    .in(
      "id",
      finished.map((f) => f.id),
    )
    .eq("settled", false);
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  let settledMatches = 0;
  let settledBets = 0;

  for (const match of (matches ?? []) as Match[]) {
    const score = byId.get(match.id);
    if (!score) continue;

    // 标记比赛结果
    const { error: updErr } = await supabase
      .from("matches")
      .update({
        status: "finished",
        home_score: score.homeScore,
        away_score: score.awayScore,
        result: score.result,
        settled: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    settledMatches++;

    // 结算该场所有未结算注单
    const { data: bets, error: bErr } = await supabase
      .from("bets")
      .select("id, pick")
      .eq("match_id", match.id)
      .eq("status", "pending");
    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }

    for (const bet of bets ?? []) {
      const won = bet.pick === score.result;
      const odds = oddsForPick(match, bet.pick as Pick) ?? 1;
      const payout = won ? Math.round(STAKE * odds) : 0;
      const { error: setErr } = await supabase
        .from("bets")
        .update({
          status: won ? "won" : "lost",
          payout,
          odds_snapshot: odds,
        })
        .eq("id", bet.id);
      if (setErr) {
        return NextResponse.json({ error: setErr.message }, { status: 500 });
      }
      settledBets++;
    }
  }

  return NextResponse.json({ ok: true, settledMatches, settledBets });
}
