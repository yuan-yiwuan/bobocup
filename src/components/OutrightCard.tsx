"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  OutrightBet,
  OutrightMarket,
  OutrightOutcome,
} from "@/lib/types";
import { humanizeBetError } from "@/lib/bets";
import { formatOdds } from "@/lib/format";

const TOP_N = 12;

/** outright 候选项展示名：球队用中文名，球员用原名。 */
function outcomeName(o: OutrightOutcome): string {
  return o.name_zh ?? o.name;
}

export default function OutrightCard({
  market,
  outcomes,
  userBet,
  userId,
}: {
  market: OutrightMarket;
  outcomes: OutrightOutcome[];
  userBet: OutrightBet | null;
  userId: string;
}) {
  const [pickId, setPickId] = useState<number | null>(
    userBet?.outcome_id ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const settled = market.settled;
  const winnerId = market.result_outcome_id;

  // 默认只展示概率最高的 TOP_N；已选中但排在外面的固定显示出来
  const visible = (() => {
    if (expanded) return outcomes;
    const top = outcomes.slice(0, TOP_N);
    if (pickId != null && !top.some((o) => o.id === pickId)) {
      const picked = outcomes.find((o) => o.id === pickId);
      if (picked) return [...top, picked];
    }
    return top;
  })();

  async function onPick(o: OutrightOutcome) {
    if (busy || settled || o.closed) return;
    setErr(null);
    setBusy(true);
    const prev = pickId;
    const supabase = createClient();

    if (pickId === o.id) {
      // 再点一次 = 撤注
      setPickId(null);
      const { error } = await supabase
        .from("outright_bets")
        .delete()
        .eq("user_id", userId)
        .eq("market_id", market.id);
      if (error) {
        setPickId(prev);
        setErr(humanizeBetError(error.message));
      }
    } else {
      setPickId(o.id);
      const { error } = await supabase.from("outright_bets").upsert(
        {
          user_id: userId,
          market_id: market.id,
          outcome_id: o.id,
          stake: 100,
          odds_snapshot: o.odds,
        },
        { onConflict: "user_id,market_id" },
      );
      if (error) {
        setPickId(prev);
        setErr(humanizeBetError(error.message));
      }
    }
    setBusy(false);
  }

  const pickedOutcome = outcomes.find((o) => o.id === pickId) ?? null;

  return (
    <div className="cartoon-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-black text-teal-deep text-lg">
          {market.kind === "golden_boot" ? "👟" : "🏆"} {market.title}
        </h3>
        {settled && (
          <span className="text-xs font-bold bg-emerald-500 text-white px-2 py-1 rounded-full border-2 border-[#0f3d3e]">
            已揭晓
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs font-bold text-teal-deep/60 mb-3">
        <span>每人一注 · 🥕100 · 选一个{market.outcome_label}</span>
        {pickedOutcome && (
          <span className="text-teal-deep">
            已投 {outcomeName(pickedOutcome)}
            {pickedOutcome.odds != null && ` ×${formatOdds(pickedOutcome.odds)}`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {visible.map((o) => {
          const selected = pickId === o.id;
          const isWinner = settled && winnerId === o.id;
          const disabled = busy || settled || o.closed;
          return (
            <button
              key={o.id}
              disabled={disabled}
              onClick={() => onPick(o)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border-2 border-[#0f3d3e] text-left transition ${
                isWinner
                  ? "bg-emerald-400 text-teal-deep"
                  : selected
                    ? "bg-yellow-300 text-teal-deep"
                    : "bg-white text-teal-deep"
              } ${o.closed && !isWinner ? "opacity-40" : ""} ${
                disabled ? "cursor-default" : "cursor-pointer"
              }`}
            >
              {o.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.image_url}
                  alt=""
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-full shrink-0 object-cover bg-white"
                />
              ) : (
                <span className="w-6 text-center shrink-0">⚽</span>
              )}
              <span className="flex-1 min-w-0 truncate text-sm font-bold">
                {outcomeName(o)}
                {o.closed && !isWinner && " · 出局"}
                {isWinner && " · 🎉"}
              </span>
              <span className="text-xs font-bold opacity-70 shrink-0">
                {o.prob != null ? `${Math.round(o.prob * 100)}%` : "—"}
                {o.odds != null && ` · ×${formatOdds(o.odds)}`}
              </span>
            </button>
          );
        })}
      </div>

      {outcomes.length > TOP_N && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-bold text-teal-brand"
        >
          {expanded ? "收起" : `展开全部 ${outcomes.length} 个`}
        </button>
      )}

      {settled && (
        <p className="mt-2 text-xs text-teal-deep/50 font-semibold">
          已揭晓，无法修改
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600 font-semibold">{err}</p>}
    </div>
  );
}
