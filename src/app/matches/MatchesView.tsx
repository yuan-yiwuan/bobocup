"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MatchCard from "@/components/MatchCard";
import type { Bet, Match, Team } from "@/lib/types";
import { matchDateKey, type TeamMap } from "@/lib/format";
import { useMounted } from "@/lib/useMounted";

export default function MatchesView({
  matches,
  teams,
  initialBets,
  userId,
  userHomeTeamId,
}: {
  matches: Match[];
  teams: Team[];
  initialBets: Bet[];
  userId: string;
  userHomeTeamId: number | null;
}) {
  const mounted = useMounted();

  const teamMap: TeamMap = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t])),
    [teams],
  );

  // match_id -> 当前用户的注单
  const betMap = useMemo(
    () => Object.fromEntries(initialBets.map((b) => [b.match_id, b])),
    [initialBets],
  );

  // 按日期分组（按浏览器本地时区，挂载后才计算以避免 hydration 不一致）
  const groups = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const key = matchDateKey(m.commence_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [matches]);

  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<number | "all">("all");

  const teamsInPlay = useMemo(() => {
    const ids = new Set<number>();
    for (const m of matches) {
      if (m.home_team_id) ids.add(m.home_team_id);
      if (m.away_team_id) ids.add(m.away_team_id);
    }
    return teams
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.name_zh.localeCompare(b.name_zh, "zh"));
  }, [matches, teams]);

  const filtering = teamFilter !== "all";
  const currentDate = activeDate ?? groups[0]?.[0] ?? "";

  // 筛选球队时：显示该队所有比赛（跨日期）；否则按当前日期 tab
  const visible = useMemo(() => {
    if (filtering) {
      return matches.filter(
        (m) => m.home_team_id === teamFilter || m.away_team_id === teamFilter,
      );
    }
    return groups.find(([d]) => d === currentDate)?.[1] ?? [];
  }, [matches, groups, currentDate, teamFilter, filtering]);

  if (matches.length === 0) {
    return (
      <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
        ⏳ 暂时没有可竞猜的比赛
        <p className="font-normal text-sm text-teal-deep/60 mt-2">
          倍数每天更新，开赛后的比赛不再显示。明天再来看看？
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
    <div className="flex flex-col gap-4">
      {/* 日期 tab（始终保留，筛选球队时变灰禁用，避免布局跳动） */}
      <div
        className={`flex gap-2 overflow-x-auto pb-1 ${
          filtering ? "opacity-40 pointer-events-none" : ""
        }`}
      >
        {groups.map(([date, ms]) => (
          <button
            key={date}
            disabled={filtering}
            onClick={() => setActiveDate(date)}
            className={`cartoon-btn shrink-0 px-3 py-2 text-sm ${
              date === currentDate && !filtering
                ? "bg-teal-brand text-white"
                : "bg-white text-teal-deep"
            }`}
          >
            {date}
            <span className="ml-1 text-xs opacity-70">{ms.length}场</span>
          </button>
        ))}
      </div>

      {/* 球队 filter + 只看主队 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-teal-deep">筛选球队</span>
        <select
          value={teamFilter}
          onChange={(e) =>
            setTeamFilter(
              e.target.value === "all" ? "all" : Number(e.target.value),
            )
          }
          className="cartoon-btn bg-white px-3 py-1.5 text-sm font-semibold"
        >
          <option value="all">全部</option>
          {teamsInPlay.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag_emoji ?? "⚽"} {t.name_zh}
            </option>
          ))}
        </select>
        {filtering ? (
          <button
            onClick={() => setTeamFilter("all")}
            className="cartoon-btn px-3 py-1.5 text-sm bg-teal-brand text-white"
          >
            看所有队
          </button>
        ) : userHomeTeamId != null ? (
          <button
            onClick={() => setTeamFilter(userHomeTeamId)}
            className="cartoon-btn px-3 py-1.5 text-sm bg-white text-teal-deep"
          >
            ⭐ 只看主队
          </button>
        ) : (
          <Link
            href="/settings"
            className="cartoon-btn px-3 py-1.5 text-sm bg-white text-teal-deep"
            title="去设置选择主队"
          >
            ⭐ 设置主队
          </Link>
        )}
      </div>

      {/* 比赛卡片 */}
      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="cartoon-card p-6 text-center text-teal-deep/70 font-semibold">
            {filtering ? "该球队没有可竞猜的比赛" : "这一天没有比赛"}
          </div>
        )}
        {visible.map((m) => {
          const bet = betMap[m.id];
          return (
            <MatchCard
              key={m.id}
              match={m}
              teams={teamMap}
              userId={userId}
              userHomeTeamId={userHomeTeamId}
              initialPick={bet?.pick ?? null}
              initialStake={bet?.stake ?? 100}
              showDate={filtering}
            />
          );
        })}
      </div>
    </div>
  );
}
