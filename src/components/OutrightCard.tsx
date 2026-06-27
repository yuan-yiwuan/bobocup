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
const OUTRIGHT_STAKE = 200;

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
  // 已下注的选项 id（一旦下注即锁定，不可修改/撤销）
  const [placedId, setPlacedId] = useState<number | null>(
    userBet?.outcome_id ?? null,
  );
  // 待确认的选项（点了但还没确认）
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const settled = market.settled;
  const winnerId = market.result_outcome_id;
  const locked = placedId != null; // 已下注

  // 默认只展示概率最高的 TOP_N；已选中但排在外面的固定显示出来
  const visible = (() => {
    if (expanded) return outcomes;
    const top = outcomes.slice(0, TOP_N);
    const keepId = placedId ?? pendingId;
    if (keepId != null && !top.some((o) => o.id === keepId)) {
      const kept = outcomes.find((o) => o.id === keepId);
      if (kept) return [...top, kept];
    }
    return top;
  })();

  function onTap(o: OutrightOutcome) {
    if (busy || settled || locked || o.closed) return;
    setErr(null);
    setPendingId((cur) => (cur === o.id ? null : o.id));
  }

  async function confirmBet() {
    if (pendingId == null || busy) return;
    const o = outcomes.find((x) => x.id === pendingId);
    if (!o) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.from("outright_bets").insert({
      user_id: userId,
      market_id: market.id,
      outcome_id: o.id,
      stake: OUTRIGHT_STAKE,
      odds_snapshot: o.odds,
    });
    setBusy(false);
    if (error) {
      setErr(humanizeBetError(error.message));
      return;
    }
    setPlacedId(o.id);
    setPendingId(null);
  }

  const placedOutcome = outcomes.find((o) => o.id === placedId) ?? null;
  const pendingOutcome = outcomes.find((o) => o.id === pendingId) ?? null;

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
        <span>每人一注 · 🥕200 · 一旦下注不可修改</span>
        {placedOutcome && (
          <span className="text-teal-deep">
            已投 {outcomeName(placedOutcome)}
            {placedOutcome.odds != null && ` ×${formatOdds(placedOutcome.odds)}`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {visible.map((o) => {
          const isPlaced = placedId === o.id;
          const isPending = pendingId === o.id;
          const isWinner = settled && winnerId === o.id;
          const disabled = busy || settled || locked || o.closed;
          return (
            <button
              key={o.id}
              disabled={disabled}
              onClick={() => onTap(o)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border-2 border-[#0f3d3e] text-left transition ${
                isWinner
                  ? "bg-emerald-400 text-teal-deep"
                  : isPlaced
                    ? "bg-yellow-300 text-teal-deep"
                    : isPending
                      ? "bg-yellow-200 text-teal-deep"
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

      {/* 下注前确认条 */}
      {!locked && !settled && pendingOutcome && (
        <div className="mt-3 cartoon-card bg-yellow-50 p-3 flex flex-col gap-2">
          <p className="text-sm font-bold text-teal-deep">
            确认猜「{outcomeName(pendingOutcome)}」？
          </p>
          <p className="text-xs text-teal-deep/70">
            下注 🥕200
            {pendingOutcome.odds != null &&
              `，猜中得 🥕${Math.round(OUTRIGHT_STAKE * pendingOutcome.odds)}`}
            。<span className="font-bold">一旦确认不可修改或撤销。</span>
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={confirmBet}
              className="cartoon-btn flex-1 bg-yellow-300 text-teal-deep px-3 py-2 text-sm font-bold"
            >
              {busy ? "提交中…" : "确认下注"}
            </button>
            <button
              disabled={busy}
              onClick={() => setPendingId(null)}
              className="cartoon-btn flex-1 bg-white text-teal-deep px-3 py-2 text-sm font-bold"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {outcomes.length > TOP_N && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-bold text-teal-brand"
        >
          {expanded ? "收起" : `展开全部 ${outcomes.length} 个`}
        </button>
      )}

      {locked && !settled && (
        <p className="mt-2 text-xs text-teal-deep/50 font-semibold">
          已下注并锁定，不可修改
        </p>
      )}
      {settled && (
        <p className="mt-2 text-xs text-teal-deep/50 font-semibold">
          已揭晓
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600 font-semibold">{err}</p>}
    </div>
  );
}
