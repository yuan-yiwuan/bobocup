import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinishedMatches } from "@/lib/oddsApi";
import { getKnockoutResults } from "@/lib/openfootball";
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
 * 结算该场所有未结算注单：猜中 payout=round(stake×锁定赔率)，猜错=0。
 * 返回结算的注单数；任一步失败抛错，让调用方整体返回 500（不会留下半结算的场）。
 */
async function settleBetsForMatch(
  supabase: ReturnType<typeof createAdminClient>,
  match: Match,
  result: Pick,
): Promise<number> {
  const { data: bets, error: bErr } = await supabase
    .from("bets")
    .select("id, pick, stake, odds_snapshot")
    .eq("match_id", match.id)
    .eq("status", "pending");
  if (bErr) throw new Error(bErr.message);

  let n = 0;
  for (const bet of bets ?? []) {
    const won = bet.pick === result;
    const odds = bet.odds_snapshot ?? oddsForPick(match, bet.pick as Pick) ?? 1;
    const stake = bet.stake ?? STAKE;
    const payout = won ? Math.round(stake * odds) : 0;
    const { error: setErr } = await supabase
      .from("bets")
      .update({ status: won ? "won" : "lost", payout, odds_snapshot: odds })
      .eq("id", bet.id);
    if (setErr) throw new Error(setErr.message);
    n++;
  }
  return n;
}

/**
 * 每小时结算：
 *  - 淘汰赛（bet_type='advance'）：从 openfootball 取晋级方结算（含点球）。
 *  - 小组赛（bet_type='h2h'）：从 the-odds-api 取比分结算（历史路径）。
 * 仅当存在「未结算 且 已开赛 ≥2 小时」的对应类型比赛时才去打外部 API。
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 心跳：记录本次结算 cron 运行时间（前端「上次结算检查时间」据此显示）。
  await supabase
    .from("app_meta")
    .upsert({ key: "last_settle_run", value: new Date().toISOString() });

  const settleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  let settledMatches = 0;
  let settledBets = 0;

  // ── 1) 淘汰赛：openfootball 晋级方 ──────────────────────────────
  const { data: advPending, error: aErr } = await supabase
    .from("matches")
    .select("*")
    .eq("settled", false)
    .eq("bet_type", "advance")
    .lt("commence_time", settleCutoff);
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  if ((advPending?.length ?? 0) > 0) {
    let results;
    try {
      results = await getKnockoutResults();
    } catch (e) {
      return NextResponse.json(
        { error: String(e instanceof Error ? e.message : e) },
        { status: 502 },
      );
    }
    const byId = new Map(results.map((r) => [r.id, r]));

    for (const match of (advPending ?? []) as Match[]) {
      const r = byId.get(match.id);
      if (!r) continue;
      const result: Pick = r.advancer === "team1" ? "home" : "away";
      try {
        settledBets += await settleBetsForMatch(supabase, match, result);
      } catch (e) {
        return NextResponse.json(
          { error: String(e instanceof Error ? e.message : e) },
          { status: 500 },
        );
      }
      const { error: updErr } = await supabase
        .from("matches")
        .update({
          status: "finished",
          home_score: r.score1,
          away_score: r.score2,
          result,
          settled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", match.id);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      settledMatches++;
    }
  }

  // ── 2) 小组赛：the-odds-api 比分（历史路径） ────────────────────
  const { count: h2hPending, error: gErr } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("settled", false)
    .eq("bet_type", "h2h")
    .lt("commence_time", settleCutoff);
  if (gErr) {
    return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  if (h2hPending) {
    let finished;
    try {
      finished = await getFinishedMatches(3);
    } catch (e) {
      return NextResponse.json(
        { error: String(e instanceof Error ? e.message : e) },
        { status: 502 },
      );
    }
    if (finished.length > 0) {
      const byId = new Map(finished.map((f) => [f.id, f]));
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

      for (const match of (matches ?? []) as Match[]) {
        const score = byId.get(match.id);
        if (!score) continue;
        try {
          settledBets += await settleBetsForMatch(
            supabase,
            match,
            score.result,
          );
        } catch (e) {
          return NextResponse.json(
            { error: String(e instanceof Error ? e.message : e) },
            { status: 500 },
          );
        }
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
    }
  }

  return NextResponse.json({ ok: true, settledMatches, settledBets });
}
