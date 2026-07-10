"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  OutrightBet,
  OutrightMarket,
  OutrightOutcome,
} from "@/lib/types";
import { humanizeBetError } from "@/lib/bets";
import { formatOdds } from "@/lib/format";

const TOP_N = 5;

/** outright 候选项展示名：球队用中文名，球员用原名。 */
function outcomeName(o: OutrightOutcome): string {
  return o.name_zh ?? o.name;
}

export default function OutrightCard({
  market,
  outcomes,
  userBet,
  userId,
  stake = 200,
  daily = false,
  highlight = false,
  deadline = null,
  peerBets = [],
  nameById = {},
}: {
  market: OutrightMarket;
  outcomes: OutrightOutcome[];
  userBet: OutrightBet | null;
  userId: string;
  /** 每注胡萝卜数：outright 200、daily 100 */
  stake?: number;
  /** 每日竞猜：下注走服务端实时校验接口 */
  daily?: boolean;
  /** 高亮 + 特效（每日竞猜未投时） */
  highlight?: boolean;
  /** 倒计时目标（ISO），每日竞猜未投时显示 */
  deadline?: string | null;
  /** 本盘所有人的竞猜（用于「大家的竞猜」下拉） */
  peerBets?: { user_id: string; outcome_id: number; status: string }[];
  /** user_id → 昵称 */
  nameById?: Record<string, string>;
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
  const [peersOpen, setPeersOpen] = useState(false);
  // 已投过的卡片默认折叠（反正不能改）
  const [collapsed, setCollapsed] = useState<boolean>(userBet != null);

  // outcome_id → 展示名（给「大家的竞猜」用）
  const nameOfOutcome = (id: number) => {
    const o = outcomes.find((x) => x.id === id);
    return o ? outcomeName(o) : "—";
  };

  const settled = market.settled;
  const winnerId = market.result_outcome_id;
  const locked = placedId != null; // 已下注

  const titleEmoji =
    market.kind === "golden_boot"
      ? "👟"
      : market.kind === "daily"
        ? "🎲"
        : market.kind === "carrot_king"
          ? "🥕"
          : "🏆";

  // 已投 + 折叠：显示精简卡，点开可看完整（只读）
  if (locked && collapsed) {
    const picked = outcomes.find((o) => o.id === placedId);
    const won = settled && winnerId === placedId;
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="cartoon-card p-3 flex items-center gap-2 text-left w-full"
      >
        <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-full border-2 border-[#0f3d3e] bg-emerald-500 text-white">
          {settled ? (won ? "猜中" : "已揭晓") : "已猜"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-teal-deep truncate text-sm">
            {titleEmoji} {market.title}
          </div>
          <div className="text-xs text-teal-deep/60 truncate">
            猜 {picked ? outcomeName(picked) : "—"} · 🥕{stake}
            {picked?.odds != null && ` ×${formatOdds(picked.odds)}`}
          </div>
        </div>
        <span className="shrink-0 text-teal-deep/40 text-xs">展开 ▾</span>
      </button>
    );
  }

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

    if (daily) {
      // 每日竞猜：走服务端接口，下注那刻实时校验 <80% 且未结束
      try {
        const res = await fetch("/api/daily/bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcomeId: o.id }),
        });
        const data = await res.json();
        setBusy(false);
        if (!res.ok) {
          setErr(humanizeBetError(data.error ?? "竞猜失败"));
          return;
        }
      } catch {
        setBusy(false);
        setErr("网络错误，请重试");
        return;
      }
      setPlacedId(o.id);
      setPendingId(null);
      setCollapsed(true);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("outright_bets").insert({
      user_id: userId,
      market_id: market.id,
      outcome_id: o.id,
      stake,
      odds_snapshot: o.odds,
    });
    setBusy(false);
    if (error) {
      setErr(humanizeBetError(error.message));
      return;
    }
    setPlacedId(o.id);
    setPendingId(null);
    setCollapsed(true);
  }

  const placedOutcome = outcomes.find((o) => o.id === placedId) ?? null;
  const pendingOutcome = outcomes.find((o) => o.id === pendingId) ?? null;

  return (
    <div className="cartoon-card p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-black text-teal-deep text-lg">
          {titleEmoji} {market.title}
        </h3>
        {settled ? (
          <span className="text-xs font-bold bg-emerald-500 text-white px-2 py-1 rounded-full border-2 border-[#0f3d3e]">
            已揭晓
          </span>
        ) : (
          locked && (
            <button
              onClick={() => setCollapsed(true)}
              className="text-xs font-bold text-teal-deep/40"
            >
              收起 ▴
            </button>
          )
        )}
      </div>

      {highlight && deadline && (
        <div className="mb-2 text-sm font-black text-teal-brand">
          ✨ 还没猜！<Countdown deadline={deadline} /> 后换新题
        </div>
      )}
      <div className="flex items-center justify-between text-xs font-bold text-teal-deep/60 mb-3">
        <span>每人一注 · 🥕{stake} · 一旦竞猜不可修改</span>
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

      {/* 下注前确认弹窗 */}
      {!locked && !settled && pendingOutcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setPendingId(null)}
        >
          <div
            className="cartoon-card bg-white p-5 w-full max-w-xs flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-black text-teal-deep text-lg">确认竞猜</h4>
            <div className="flex items-center gap-2">
              {pendingOutcome.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pendingOutcome.image_url}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover bg-white border-2 border-[#0f3d3e]"
                />
              ) : (
                <span className="text-2xl">{market.kind === "golden_boot" ? "👟" : "🏆"}</span>
              )}
              <div className="min-w-0">
                <div className="font-black text-teal-deep truncate">
                  {outcomeName(pendingOutcome)}
                </div>
                <div className="text-xs text-teal-deep/60">
                  {market.title}
                  {pendingOutcome.odds != null &&
                    ` · ×${formatOdds(pendingOutcome.odds)}`}
                </div>
              </div>
            </div>
            <p className="text-sm text-teal-deep/80">
              竞猜 <b>🥕{stake}</b>
              {pendingOutcome.odds != null && (
                <>
                  ，猜中得{" "}
                  <b>🥕{Math.round(stake * pendingOutcome.odds)}</b>
                </>
              )}
              。
            </p>
            <p className="text-sm text-teal-deep/80">竞猜后不可修改或撤销</p>
            <div className="flex gap-2 mt-1">
              <button
                disabled={busy}
                onClick={confirmBet}
                className="cartoon-btn flex-1 bg-yellow-300 text-teal-deep px-3 py-3 font-bold"
              >
                {busy ? "提交中…" : "确定"}
              </button>
              <button
                disabled={busy}
                onClick={() => setPendingId(null)}
                className="cartoon-btn flex-1 bg-white text-teal-deep px-3 py-3 font-bold"
              >
                取消
              </button>
            </div>
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
          已竞猜并锁定，不可修改
        </p>
      )}
      {settled && (
        <p className="mt-2 text-xs text-teal-deep/50 font-semibold">
          已揭晓
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600 font-semibold">{err}</p>}

      {peerBets.filter((b) => b.user_id !== userId).length > 0 && (
        <div className="mt-2 border-t-2 border-dashed border-teal-deep/20 pt-2">
          <button
            onClick={() => setPeersOpen((v) => !v)}
            className="text-xs font-bold text-teal-brand"
          >
            🐰 大家的竞猜 (
            {peerBets.filter((b) => b.user_id !== userId).length})
            {peersOpen ? " ▴" : " ▾"}
          </button>
          {peersOpen && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {peerBets
                .filter((b) => b.user_id !== userId)
                .map((b, i) => {
                const win = settled && winnerId === b.outcome_id;
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-bold text-teal-deep truncate">
                      {nameById[b.user_id] ?? "神秘人"}
                    </span>
                    <span
                      className={`shrink-0 ${
                        win ? "text-emerald-600 font-bold" : "text-teal-deep/70"
                      }`}
                    >
                      {nameOfOutcome(b.outcome_id)}
                      {win && " 🎉"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 到 deadline 的倒计时（HH:MM:SS），每秒刷新。 */
function Countdown({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(deadline).getTime() - now);
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span className="tabular-nums">
      {hh}:{mm}:{ss}
    </span>
  );
}
