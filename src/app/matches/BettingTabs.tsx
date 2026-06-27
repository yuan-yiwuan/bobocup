"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MatchesView from "./MatchesView";
import OutrightCard from "@/components/OutrightCard";
import type {
  Bet,
  Match,
  OutrightBet,
  OutrightMarket,
  OutrightOutcome,
  Team,
} from "@/lib/types";

export default function BettingTabs({
  matches,
  teams,
  initialBets,
  userId,
  userHomeTeamId,
  outrightMarkets,
  outrightOutcomes,
  outrightBets,
  dailyMarket,
  dailyOutcomes,
  dailyBet,
  dailyDeadline,
}: {
  matches: Match[];
  teams: Team[];
  initialBets: Bet[];
  userId: string;
  userHomeTeamId: number | null;
  outrightMarkets: OutrightMarket[];
  outrightOutcomes: OutrightOutcome[];
  outrightBets: OutrightBet[];
  dailyMarket: OutrightMarket | null;
  dailyOutcomes: OutrightOutcome[];
  dailyBet: OutrightBet | null;
  dailyDeadline: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // 每日竞猜还没投 → 默认落到「特别竞猜」tab（登录后引导去猜）
  const dailyUnbet = !!dailyMarket && !dailyBet;
  const tabParam = searchParams.get("tab");
  const tab =
    tabParam === "special"
      ? "special"
      : tabParam === "matches"
        ? "matches"
        : dailyUnbet
          ? "special"
          : "matches";

  function setTab(next: "matches" | "special") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "special") params.set("tab", "special");
    else params.delete("tab");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  // market_id -> 候选项（已按 sort_order 排序）
  const outcomesByMarket = useMemo(() => {
    const map = new Map<string, OutrightOutcome[]>();
    for (const o of outrightOutcomes) {
      if (!map.has(o.market_id)) map.set(o.market_id, []);
      map.get(o.market_id)!.push(o);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return map;
  }, [outrightOutcomes]);

  const betByMarket = useMemo(
    () => Object.fromEntries(outrightBets.map((b) => [b.market_id, b])),
    [outrightBets],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部 tab */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("matches")}
          className={`cartoon-btn flex-1 px-3 py-2 text-sm font-bold ${
            tab === "matches"
              ? "bg-teal-brand text-white"
              : "bg-white text-teal-deep"
          }`}
        >
          ⚽ 比赛竞猜
        </button>
        <button
          onClick={() => setTab("special")}
          className={`cartoon-btn flex-1 px-3 py-2 text-sm font-bold ${
            tab === "special"
              ? "bg-teal-brand text-white"
              : "bg-white text-teal-deep"
          }`}
        >
          🏆 特别竞猜
        </button>
      </div>

      {tab === "matches" ? (
        <MatchesView
          matches={matches}
          teams={teams}
          initialBets={initialBets}
          userId={userId}
          userHomeTeamId={userHomeTeamId}
        />
      ) : outrightMarkets.length === 0 && !dailyMarket ? (
        <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
          ⏳ 特别竞猜还没上线
          <p className="font-normal text-sm text-teal-deep/60 mt-2">
            金靴、夺冠等竞猜即将开放，稍后再来看看？
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {dailyMarket && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-teal-deep/60 font-semibold">
                🎲 今日竞猜 · 每天一题 · 一注 🥕100 · 当天有效
              </p>
              <OutrightCard
                market={dailyMarket}
                outcomes={dailyOutcomes}
                userBet={dailyBet}
                userId={userId}
                stake={100}
                daily
                highlight={dailyUnbet}
                deadline={dailyDeadline}
              />
            </div>
          )}
          <p className="text-xs text-teal-deep/60 font-semibold">
            🏆 长期竞猜：一直开放到揭晓，倍数每天更新，竞猜那刻锁定。
          </p>
          {outrightMarkets.map((m) => (
            <OutrightCard
              key={m.id}
              market={m}
              outcomes={outcomesByMarket.get(m.id) ?? []}
              userBet={betByMarket[m.id] ?? null}
              userId={userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
