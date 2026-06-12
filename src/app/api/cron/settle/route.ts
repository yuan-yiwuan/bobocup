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

  // 心跳：记录本次结算 cron 运行时间（即使下面守卫判定无可结算而早退），
  // 前端「上次结算检查时间」据此显示，让用户知道系统在正常运转。
  await supabase
    .from("app_meta")
    .upsert({ key: "last_settle_run", value: new Date().toISOString() });

  // 守卫：只有当库里存在「未结算 且 已开赛 ≥2 小时（大概率已踢完）」的比赛时，
  // 才去打 odds API。否则每小时空跑会白白消耗 the-odds-api 额度
  // （/scores 带 daysFrom 每次 2 credits）。加时/点球延后的，下一个小时会补上。
  const settleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { count: pendingMatches, error: gErr } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("settled", false)
    .lt("commence_time", settleCutoff);
  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }
  if (!pendingMatches) {
    return NextResponse.json({ ok: true, settledMatches: 0, settledBets: 0 });
  }

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

    // 先结算该场所有未结算注单，全部成功后再标记比赛 settled。
    // 否则中途失败会留下「比赛已 settled、注单仍 pending」的孤儿，
    // 下次运行因 settled=false 过滤被排除，永远不会被结算。
    const { data: bets, error: bErr } = await supabase
      .from("bets")
      .select("id, pick, stake, odds_snapshot")
      .eq("match_id", match.id)
      .eq("status", "pending");
    if (bErr) {
      return NextResponse.json({ error: bErr.message }, { status: 500 });
    }

    for (const bet of bets ?? []) {
      const won = bet.pick === score.result;
      // 赔率以下单时锁定的为准；缺失则回退到比赛当前赔率
      const odds =
        bet.odds_snapshot ?? oddsForPick(match, bet.pick as Pick) ?? 1;
      const stake = bet.stake ?? STAKE;
      const payout = won ? Math.round(stake * odds) : 0;
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

    // 注单全部结算成功，最后标记比赛结果。
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
  }

  return NextResponse.json({ ok: true, settledMatches, settledBets });
}
