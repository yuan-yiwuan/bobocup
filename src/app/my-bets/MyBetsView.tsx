"use client";

import { useMemo } from "react";
import MatchCard from "@/components/MatchCard";
import type { Bet, Match, Team } from "@/lib/types";
import { hasStarted } from "@/lib/bets";
import { useMounted } from "@/lib/useMounted";
import {
  matchDateKey,
  matchTime,
  pickLabel,
  sideLabel,
  type TeamMap,
} from "@/lib/format";

export default function MyBetsView({
  bets,
  matches,
  teams,
  userId,
  userHomeTeamId,
}: {
  bets: Bet[];
  matches: Match[];
  teams: Team[];
  userId: string;
  userHomeTeamId: number | null;
}) {
  const mounted = useMounted();
  const teamMap: TeamMap = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t])),
    [teams],
  );
  const matchMap = useMemo(
    () => Object.fromEntries(matches.map((m) => [m.id, m])),
    [matches],
  );

  const sorted = useMemo(
    () =>
      [...bets].sort((a, b) =>
        (matchMap[a.match_id]?.commence_time ?? "").localeCompare(
          matchMap[b.match_id]?.commence_time ?? "",
        ),
      ),
    [bets, matchMap],
  );

  // 三类：可改（未开赛）/ 待结算（已开赛未出结果）/ 已结算
  const editable: { bet: Bet; match: Match }[] = [];
  const locked: { bet: Bet; match: Match }[] = [];
  const settled: { bet: Bet; match: Match }[] = [];

  for (const bet of sorted) {
    const match = matchMap[bet.match_id];
    if (!match) continue;
    if (bet.status === "won" || bet.status === "lost") {
      settled.push({ bet, match });
    } else if (hasStarted(match)) {
      locked.push({ bet, match });
    } else {
      editable.push({ bet, match });
    }
  }

  if (bets.length === 0) {
    return (
      <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
        还没有投注 ⚽
        <p className="font-normal text-sm text-teal-deep/60 mt-2">
          去「竞猜」页押几注吧，每注 100 根 🥕。
        </p>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="cartoon-card p-8 text-center text-teal-deep/60 font-bold">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {editable.length > 0 && (
        <Group title={`可修改（未开赛 · ${editable.length}）`}>
          <div className="flex flex-col gap-3">
            {editable.map(({ bet, match }) => (
              <MatchCard
                key={bet.id}
                match={match}
                teams={teamMap}
                userId={userId}
                userHomeTeamId={userHomeTeamId}
                initialPick={bet.pick}
                initialStake={bet.stake}
                showDate
              />
            ))}
          </div>
        </Group>
      )}

      {locked.length > 0 && (
        <Group title={`待结算（已开赛 · ${locked.length}）`}>
          <div className="flex flex-col gap-2">
            {locked.map(({ bet, match }) => (
              <StaticRow key={bet.id} bet={bet} match={match} teams={teamMap} />
            ))}
          </div>
        </Group>
      )}

      {settled.length > 0 && (
        <Group title={`已结算（${settled.length}）`}>
          <div className="flex flex-col gap-2">
            {settled.map(({ bet, match }) => (
              <StaticRow key={bet.id} bet={bet} match={match} teams={teamMap} />
            ))}
          </div>
        </Group>
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-black text-teal-deep mb-2">{title}</h2>
      {children}
    </section>
  );
}

function StaticRow({
  bet,
  match,
  teams,
}: {
  bet: Bet;
  match: Match;
  teams: TeamMap;
}) {
  const badge =
    bet.status === "won"
      ? { text: "猜中", cls: "bg-emerald-500 text-white" }
      : bet.status === "lost"
        ? { text: "毒奶", cls: "bg-red-400 text-white" }
        : { text: "进行中", cls: "bg-gray-300 text-teal-deep" };

  return (
    <div className="cartoon-card p-3 flex items-center gap-2">
      <span
        className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full border-2 border-[#0f3d3e] ${badge.cls}`}
      >
        {badge.text}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-teal-deep truncate text-sm">
          {sideLabel(match, "home", teams)} vs {sideLabel(match, "away", teams)}
        </div>
        <div className="text-xs text-teal-deep/60">
          {matchDateKey(match.commence_time)} {matchTime(match.commence_time)} · 押{" "}
          {pickLabel(match, bet.pick, teams)} · 🥕{bet.stake}
          {match.status === "finished" &&
            match.home_score != null &&
            ` · 比分 ${match.home_score}:${match.away_score}`}
        </div>
      </div>
      {bet.status === "won" && bet.payout != null && (
        <span className="text-sm font-bold text-emerald-600 shrink-0">
          +🥕{bet.payout - bet.stake}
        </span>
      )}
      {bet.status === "lost" && (
        <span className="text-sm font-bold text-red-500 shrink-0">
          −🥕{bet.stake}
        </span>
      )}
    </div>
  );
}
