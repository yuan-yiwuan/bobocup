import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyMarket } from "@/lib/polymarketApi";
import { pacificDate } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

/**
 * 每日竞猜下注：下注那一刻**实时** call Polymarket 校验
 *  - 该竞猜未结束（未揭晓）
 *  - 所选选项当前概率 < 80%
 * 通过才写库。客户端不能直连插入 daily 注单（RLS 限制），只能走这里。
 * 一注固定 100，不可改（触发器强制）。
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let outcomeId: number;
  try {
    const body = await request.json();
    outcomeId = Number(body.outcomeId);
  } catch {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  if (!Number.isInteger(outcomeId)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  // 今日 featured 的每日竞猜
  const today = pacificDate();
  const { data: market } = await supabase
    .from("outright_markets")
    .select("id, settled")
    .eq("kind", "daily")
    .eq("featured_date", today)
    .maybeSingle();
  if (!market) {
    return NextResponse.json({ error: "今日竞猜不可用" }, { status: 400 });
  }
  if (market.settled) {
    return NextResponse.json({ error: "今日竞猜已揭晓" }, { status: 400 });
  }

  // 选项必须属于这个盘
  const { data: outcome } = await supabase
    .from("outright_outcomes")
    .select("id, name")
    .eq("id", outcomeId)
    .eq("market_id", market.id)
    .maybeSingle();
  if (!outcome) {
    return NextResponse.json({ error: "选项不存在" }, { status: 400 });
  }

  // 实时校验
  let live;
  try {
    live = await getDailyMarket(market.id as string);
  } catch {
    return NextResponse.json({ error: "校验失败，稍后再试" }, { status: 502 });
  }
  if (live.resolved || live.closed) {
    return NextResponse.json({ error: "该竞猜已揭晓" }, { status: 400 });
  }
  const liveOutcome = live.outcomes.find((o) => o.name === outcome.name);
  if (!liveOutcome || liveOutcome.closed) {
    return NextResponse.json({ error: "该选项已不可用" }, { status: 400 });
  }
  if (liveOutcome.prob > 0.8) {
    return NextResponse.json(
      { error: "该选项当前概率已超 80%，换一个吧" },
      { status: 400 },
    );
  }

  const odds =
    liveOutcome.prob > 0 ? Math.round((1 / liveOutcome.prob) * 100) / 100 : null;

  // 服务端写库（绕过「daily 不可客户端插入」的 RLS；触发器会强制 stake=100）
  const admin = createAdminClient();
  const { error } = await admin.from("outright_bets").insert({
    user_id: user.id,
    market_id: market.id,
    outcome_id: outcomeId,
    stake: 100,
    odds_snapshot: odds,
  });
  if (error) {
    if (error.code === "23505" || /duplicate/i.test(error.message)) {
      return NextResponse.json({ error: "你已经猜过今天的了" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, odds });
}
