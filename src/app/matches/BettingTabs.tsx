"use client";

import { useEffect, useMemo } from "react";
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
  nameById,
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
  /** 所有人的特别竞猜注单（用于「大家的竞猜」） */
  outrightBets: OutrightBet[];
  nameById: Record<string, string>;
  dailyMarket: OutrightMarket | null;
  dailyOutcomes: OutrightOutcome[];
  dailyBet: OutrightBet | null;
  dailyDeadline: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dailyUnbet = !!dailyMarket && !dailyBet;
  const tabParam = searchParams.get("tab");
  const tab = tabParam === "special" ? "special" : "matches";

  // 每天第一次进竞猜页（该设备），若今天的每日竞猜还没投，引导去「特别竞猜」一次。
  // 用 featured_date 作为「今天」的 key；当天再进就不打扰了。
  const nudgeKey = dailyMarket?.featured_date ?? null;
  useEffect(() => {
    if (tabParam || !dailyUnbet || !nudgeKey) return;
    try {
      const STORE = "bobocup-daily-nudge";
      if (localStorage.getItem(STORE) === nudgeKey) return; // 今天已引导过
      localStorage.setItem(STORE, nudgeKey);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "special");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } catch {
      /* localStorage 不可用则忽略 */
    }
    // 仅首次挂载执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // 当前用户自己在每个盘的注单（决定卡片是否已锁定）
  const betByMarket = useMemo(() => {
    const m: Record<string, OutrightBet> = {};
    for (const b of outrightBets) if (b.user_id === userId) m[b.market_id] = b;
    return m;
  }, [outrightBets, userId]);

  // 每个盘所有人的注单（「大家的竞猜」下拉）
  const peerBetsByMarket = useMemo(() => {
    const map: Record<string, OutrightBet[]> = {};
    for (const b of outrightBets) (map[b.market_id] ??= []).push(b);
    return map;
  }, [outrightBets]);

  return (
    <div className="flex flex-col gap-4">
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
                peerBets={peerBetsByMarket[dailyMarket.id] ?? []}
                nameById={nameById}
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
              peerBets={peerBetsByMarket[m.id] ?? []}
              nameById={nameById}
            />
          ))}
        </div>
      )}
    </div>
  );
}
