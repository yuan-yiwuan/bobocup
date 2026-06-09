"use client";

import { useMemo, useState } from "react";
import type { Bet, LeaderboardRow, Match, Team } from "@/lib/types";
import {
  formatMilk,
  matchDateKey,
  pickLabel,
  sideLabel,
  type TeamMap,
} from "@/lib/format";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardView({
  rows,
  bets,
  matches,
  teams,
  currentUserId,
}: {
  rows: LeaderboardRow[];
  bets: Bet[];
  matches: Match[];
  teams: Team[];
  currentUserId: string;
}) {
  const teamMap: TeamMap = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t])),
    [teams],
  );
  const matchMap = useMemo(
    () => Object.fromEntries(matches.map((m) => [m.id, m])),
    [matches],
  );
  const betsByUser = useMemo(() => {
    const map = new Map<string, Bet[]>();
    for (const b of bets) {
      if (!map.has(b.user_id)) map.set(b.user_id, []);
      map.get(b.user_id)!.push(b);
    }
    return map;
  }, [bets]);

  const [expanded, setExpanded] = useState<string | null>(null);

  // 只显示已经投过注的人（有 pending 也算参与）
  const visibleRows = useMemo(
    () => rows.filter((r) => (betsByUser.get(r.id)?.length ?? 0) > 0),
    [rows, betsByUser],
  );

  if (visibleRows.length === 0) {
    return (
      <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
        还没有人入榜，快去竞猜吧 ⚽
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visibleRows.map((row, i) => {
        const team = row.home_team_id ? teamMap[row.home_team_id] : undefined;
        const isOpen = expanded === row.id;
        const isMe = row.id === currentUserId;
        const userBets = (betsByUser.get(row.id) ?? []).sort((a, b) =>
          (matchMap[a.match_id]?.commence_time ?? "").localeCompare(
            matchMap[b.match_id]?.commence_time ?? "",
          ),
        );
        const isMilkKing = i === 0 && row.milk_index != null;

        return (
          <div key={row.id} className="cartoon-card overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : row.id)}
              className="w-full flex items-center gap-3 p-4 text-left"
            >
              <span className="text-xl w-7 text-center shrink-0">
                {MEDALS[i] ?? i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-teal-deep flex items-center gap-2 flex-wrap">
                  <span className="truncate">{row.nickname ?? "神秘人"}</span>
                  {isMe && (
                    <span className="text-xs bg-ocean text-white px-1.5 py-0.5 rounded-full">
                      我
                    </span>
                  )}
                  {isMilkKing && (
                    <span className="text-xs bg-yellow-300 text-teal-deep px-1.5 py-0.5 rounded-full border border-[#0f3d3e]">
                      👑 本届毒奶王
                    </span>
                  )}
                </div>
                <div className="text-xs text-teal-deep/60 font-semibold mt-0.5">
                  {team ? `${team.flag_emoji ?? "⚽"} ${team.name_zh}` : "未选主队"}
                  {" · "}
                  已结算 {row.settled_bets} 场 · 猜中 {row.won_bets} 场
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-black text-teal-deep">
                  {formatMilk(row.milk_index)}
                </div>
                <div className="text-[10px] text-teal-deep/50 font-bold">
                  毒奶指数
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t-2 border-dashed border-teal-deep/30 px-4 py-3 bg-teal-50/50">
                {userBets.length === 0 ? (
                  <p className="text-sm text-teal-deep/60 font-semibold py-2">
                    还没有投注记录
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {userBets.map((b) => {
                      const m = matchMap[b.match_id];
                      if (!m) return null;
                      return (
                        <li
                          key={b.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <BetStatusBadge bet={b} />
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-teal-deep truncate">
                              {sideLabel(m, "home", teamMap)} vs{" "}
                              {sideLabel(m, "away", teamMap)}
                            </div>
                            <div className="text-xs text-teal-deep/60">
                              {matchDateKey(m.commence_time)} · 押{" "}
                              {pickLabel(m, b.pick, teamMap)}
                              {m.status === "finished" &&
                                m.home_score != null &&
                                ` · 比分 ${m.home_score}:${m.away_score}`}
                            </div>
                          </div>
                          {b.status === "won" && b.payout != null && (
                            <span className="text-xs font-bold text-emerald-600 shrink-0">
                              +🥕{b.payout}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BetStatusBadge({ bet }: { bet: Bet }) {
  const map = {
    won: { text: "猜中", cls: "bg-emerald-500 text-white" },
    lost: { text: "毒奶", cls: "bg-red-400 text-white" },
    pending: { text: "未开赛", cls: "bg-gray-300 text-teal-deep" },
  } as const;
  const s = map[bet.status];
  return (
    <span
      className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full border-2 border-[#0f3d3e] ${s.cls}`}
    >
      {s.text}
    </span>
  );
}
