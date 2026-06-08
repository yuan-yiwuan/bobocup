"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Bet, Match, Pick, Team } from "@/lib/types";
import { STAKE } from "@/lib/types";
import {
  formatOdds,
  matchDateKey,
  matchTime,
  pickLabel,
  sideLabel,
  type TeamMap,
} from "@/lib/format";

const PICKS: Pick[] = ["home", "draw", "away"];

export default function MatchesView({
  matches,
  teams,
  initialBets,
}: {
  matches: Match[];
  teams: Team[];
  initialBets: Bet[];
}) {
  const router = useRouter();
  const teamMap: TeamMap = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t])),
    [teams],
  );

  // match_id -> pick（当前用户的投注）
  const [bets, setBets] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(initialBets.map((b) => [b.match_id, b.pick])),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 按日期分组
  const groups = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const key = matchDateKey(m.commence_time);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [matches]);

  const [activeDate, setActiveDate] = useState(groups[0]?.[0] ?? "");
  const [teamFilter, setTeamFilter] = useState<number | "all">("all");

  // 出现在赛程里的球队（用于 filter）
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

  const visible = useMemo(() => {
    const inDate =
      groups.find(([d]) => d === activeDate)?.[1] ?? [];
    if (teamFilter === "all") return inDate;
    return inDate.filter(
      (m) => m.home_team_id === teamFilter || m.away_team_id === teamFilter,
    );
  }, [groups, activeDate, teamFilter]);

  async function placeBet(match: Match, pick: Pick) {
    setError(null);
    setPending(match.id);
    const prev = bets[match.id];
    setBets((b) => ({ ...b, [match.id]: pick })); // 乐观更新

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const { error: err } = await supabase.from("bets").upsert(
      { user_id: user.id, match_id: match.id, pick, stake: STAKE },
      { onConflict: "user_id,match_id" },
    );

    if (err) {
      // 回滚
      setBets((b) => {
        const next = { ...b };
        if (prev) next[match.id] = prev;
        else delete next[match.id];
        return next;
      });
      setError(err.message.includes("已开赛") ? "比赛已开赛，无法下注" : err.message);
    }
    setPending(null);
  }

  if (matches.length === 0) {
    return (
      <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
        ⏳ 暂时没有可竞猜的比赛
        <p className="font-normal text-sm text-teal-deep/60 mt-2">
          赔率每天更新，开赛后的比赛不再显示。明天再来看看？
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 日期 tab */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {groups.map(([date, ms]) => (
          <button
            key={date}
            onClick={() => setActiveDate(date)}
            className={`cartoon-btn shrink-0 px-3 py-2 text-sm ${
              date === activeDate
                ? "bg-teal-brand text-white"
                : "bg-white text-teal-deep"
            }`}
          >
            {date}
            <span className="ml-1 text-xs opacity-70">{ms.length}场</span>
          </button>
        ))}
      </div>

      {/* 球队 filter */}
      <div className="flex items-center gap-2">
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
      </div>

      {error && (
        <p className="text-red-600 font-semibold text-sm bg-red-50 cartoon-btn px-3 py-2">
          {error}
        </p>
      )}

      {/* 比赛卡片 */}
      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <div className="cartoon-card p-6 text-center text-teal-deep/70 font-semibold">
            这一天没有该球队的比赛
          </div>
        )}
        {visible.map((m) => {
          const myPick = bets[m.id];
          const isPending = pending === m.id;
          return (
            <div key={m.id} className="cartoon-card p-4">
              <div className="flex items-center justify-between text-xs font-bold text-teal-deep/60 mb-2">
                <span>🕐 {matchTime(m.commence_time)}</span>
                {myPick && (
                  <span className="text-teal-deep">
                    已押 🥕{STAKE} · {pickLabel(m, myPick, teamMap)}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 font-black text-teal-deep text-lg mb-3">
                <span className="flex-1 text-right">
                  {sideLabel(m, "home", teamMap)}
                </span>
                <span className="text-teal-deep/40 text-sm">VS</span>
                <span className="flex-1 text-left">
                  {sideLabel(m, "away", teamMap)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PICKS.map((p) => {
                  const odds =
                    p === "home"
                      ? m.odds_home
                      : p === "draw"
                        ? m.odds_draw
                        : m.odds_away;
                  const selected = myPick === p;
                  return (
                    <button
                      key={p}
                      disabled={isPending}
                      onClick={() => placeBet(m, p)}
                      className={`cartoon-btn px-2 py-2 flex flex-col items-center ${
                        selected
                          ? "bg-yellow-300 text-teal-deep"
                          : "bg-white text-teal-deep"
                      }`}
                    >
                      <span className="text-sm leading-tight">
                        {p === "draw"
                          ? "平局"
                          : p === "home"
                            ? "主胜"
                            : "客胜"}
                      </span>
                      <span className="text-xs opacity-70">
                        {formatOdds(odds)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
