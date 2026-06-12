"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bet, LeaderboardRow, Match, Team } from "@/lib/types";
import {
  formatLossRate,
  formatProfit,
  matchDateKey,
  pickLabel,
  sideLabel,
  type TeamMap,
} from "@/lib/format";
import { hasStarted } from "@/lib/bets";
import { useMounted } from "@/lib/useMounted";

const MEDALS = ["🥇", "🥈", "🥉"];

type Tab = "milk" | "profit";

/** 单个用户的榜单派生数据。 */
interface Enriched {
  row: LeaderboardRow;
  settled: number;
  lost: number;
  /** 猜错率（毒奶指数），无已结算注单时为 null。 */
  lossRate: number | null;
  /** 净收益（收到 − 押注），无已结算注单时为 null。 */
  profit: number | null;
}

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

  const [tab, setTab] = useState<Tab>("milk");
  const [expanded, setExpanded] = useState<string | null>(null);
  const mounted = useMounted();

  // 只显示已经投过注的人（有 pending 也算参与），按当前 tab 的指标排序（null 垫底）
  const ranked = useMemo(() => {
    const enriched: Enriched[] = rows
      .filter((r) => (betsByUser.get(r.id)?.length ?? 0) > 0)
      .map((row) => {
        const settled = row.settled_bets;
        const lost = settled - row.won_bets;
        return {
          row,
          settled,
          lost,
          lossRate: settled > 0 ? lost / settled : null,
          profit: settled > 0 ? row.total_returned - row.total_staked : null,
        };
      });

    const key = (e: Enriched) => (tab === "milk" ? e.lossRate : e.profit);
    return enriched.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka == null) return kb == null ? 0 : 1;
      if (kb == null) return -1;
      if (kb !== ka) return kb - ka;
      // 毒奶榜同率时，猜错场次多的更毒
      return tab === "milk" ? b.lost - a.lost : 0;
    });
  }, [rows, betsByUser, tab]);

  // 用户 id → 昵称
  const nameOf = useMemo(() => {
    const map = new Map(rows.map((r) => [r.id, r.nickname ?? "神秘人"]));
    return (id: string) => map.get(id) ?? "神秘人";
  }, [rows]);

  // 昨日榜：只统计「昨天开赛、已结算」的注单。依赖当前时间，挂载后再算避免 hydration 不一致。
  const awards = useMemo(() => {
    if (!mounted) return null;
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const startYesterday = startToday - 24 * 60 * 60 * 1000;

    const stat = new Map<string, { won: number; lost: number; net: number }>();
    for (const b of bets) {
      if (b.status !== "won" && b.status !== "lost") continue;
      const m = matchMap[b.match_id];
      if (!m) continue;
      const t = new Date(m.commence_time).getTime();
      if (t < startYesterday || t >= startToday) continue;
      const s = stat.get(b.user_id) ?? { won: 0, lost: 0, net: 0 };
      if (b.status === "won") s.won++;
      else s.lost++;
      s.net += (b.payout ?? 0) - b.stake;
      stat.set(b.user_id, s);
    }
    if (stat.size === 0) return null;

    const arr = [...stat.entries()].map(([id, s]) => ({
      id,
      winRate: s.won / (s.won + s.lost),
      net: s.net,
    }));
    const maxWin = Math.max(...arr.map((e) => e.winRate));
    const minWin = Math.min(...arr.map((e) => e.winRate));
    const maxNet = Math.max(...arr.map((e) => e.net));
    const minNet = Math.min(...arr.map((e) => e.net));
    return {
      // 毒奶榜：命中率
      accurate: arr.filter((e) => e.winRate === maxWin).map((e) => e.id),
      accurateRate: maxWin,
      milk: arr.filter((e) => e.winRate === minWin).map((e) => e.id),
      milkRate: 1 - minWin,
      // 收益榜：净胡萝卜
      earn: arr.filter((e) => e.net === maxNet).map((e) => e.id),
      earnNet: maxNet,
      lose: arr.filter((e) => e.net === minNet).map((e) => e.id),
      loseNet: minNet,
    };
  }, [mounted, bets, matchMap]);

  if (ranked.length === 0) {
    return (
      <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
        还没有人入榜，快去竞猜吧 ⚽
      </div>
    );
  }

  const kingText = tab === "milk" ? "👑 当前毒奶王" : "👑 胡萝卜最多";

  return (
    <div className="flex flex-col gap-3">
      {/* tab 切换 */}
      <div className="flex gap-2">
        <TabButton active={tab === "milk"} onClick={() => setTab("milk")}>
          🥛 毒奶榜
        </TabButton>
        <TabButton active={tab === "profit"} onClick={() => setTab("profit")}>
          🥕 收成榜
        </TabButton>
      </div>

      {/* 昨日榜 */}
      {awards && (
        <div className="grid grid-cols-2 gap-3">
          {tab === "milk" ? (
            <>
              <AwardCard
                title="🎯 昨日最准"
                tone="good"
                names={awards.accurate.map(nameOf)}
                value={`命中率 ${Math.round(awards.accurateRate * 100)}%`}
              />
              <AwardCard
                title="🥛 昨日最毒"
                tone="milk"
                names={awards.milk.map(nameOf)}
                value={`猜错率 ${Math.round(awards.milkRate * 100)}%`}
              />
            </>
          ) : (
            <>
              <AwardCard
                title="💰 昨日最赚"
                tone="good"
                names={awards.earn.map(nameOf)}
                value={carrotText(awards.earnNet)}
              />
              <AwardCard
                title="💸 昨日最赔"
                tone="milk"
                names={awards.lose.map(nameOf)}
                value={carrotText(awards.loseNet)}
              />
            </>
          )}
        </div>
      )}

      {ranked.map((e, i) => {
        const { row, settled, lost, lossRate, profit } = e;
        const team = row.home_team_id ? teamMap[row.home_team_id] : undefined;
        const isOpen = expanded === row.id;
        const isMe = row.id === currentUserId;
        const userBets = (betsByUser.get(row.id) ?? []).sort((a, b) =>
          (matchMap[a.match_id]?.commence_time ?? "").localeCompare(
            matchMap[b.match_id]?.commence_time ?? "",
          ),
        );
        const metric = tab === "milk" ? lossRate : profit;
        const isKing = i === 0 && metric != null;

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
                  {isKing && (
                    <span className="text-xs bg-yellow-300 text-teal-deep px-1.5 py-0.5 rounded-full border border-[#0f3d3e]">
                      {kingText}
                    </span>
                  )}
                </div>
                <div className="text-xs text-teal-deep/60 font-semibold mt-0.5">
                  {team ? `${team.flag_emoji ?? "⚽"} ${team.name_zh}` : "未选主队"}
                  {" · "}
                  已结算 {settled} 场 · 猜中 {row.won_bets} · 猜错 {lost}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-black text-teal-deep">
                  {tab === "milk"
                    ? formatLossRate(lossRate)
                    : formatProfit(profit)}
                </div>
                <div className="text-[10px] text-teal-deep/50 font-bold">
                  {tab === "milk" ? "毒奶指数" : "胡萝卜"}
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
                          <BetStatusBadge bet={b} match={m} />
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
                              +🥕{b.payout - b.stake}
                            </span>
                          )}
                          {b.status === "lost" && (
                            <span className="text-xs font-bold text-red-500 shrink-0">
                              −🥕{b.stake}
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

/** 净胡萝卜带符号文案：+🥕N / −🥕N / 🥕0。 */
function carrotText(net: number): string {
  if (net > 0) return `+🥕${net}`;
  if (net < 0) return `−🥕${-net}`;
  return "🥕0";
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 cartoon-btn py-2 font-black text-sm ${
        active ? "bg-teal-brand text-white" : "bg-white text-teal-deep"
      }`}
    >
      {children}
    </button>
  );
}

/** 昨日榜单卡片：标题 + 获奖人（多人并列时轮播）+ 数值。 */
function AwardCard({
  title,
  tone,
  names,
  value,
}: {
  title: string;
  tone: "good" | "milk";
  names: string[];
  value: string;
}) {
  const toneCls =
    tone === "milk"
      ? "bg-red-50 border-red-300"
      : "bg-emerald-50 border-emerald-300";
  return (
    <div className={`cartoon-card border-2 p-3 ${toneCls}`}>
      <div className="text-xs font-black text-teal-deep/70">{title}</div>
      <div className="font-black text-teal-deep truncate mt-0.5">
        <Carousel items={names} />
      </div>
      <div className="text-sm font-bold mt-0.5 text-teal-deep/80">{value}</div>
    </div>
  );
}

/** 多人并列时轮播显示，单人时静态显示。 */
function Carousel({ items }: { items: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setI((x) => x + 1), 2500);
    return () => clearInterval(id);
  }, [items.length]);
  if (items.length === 0) return <span>—</span>;
  const idx = i % items.length;
  return (
    <span>
      {items[idx]}
      {items.length > 1 && (
        <span className="text-xs font-bold text-teal-deep/50">
          {" "}
          ({idx + 1}/{items.length})
        </span>
      )}
    </span>
  );
}

function BetStatusBadge({ bet, match }: { bet: Bet; match: Match }) {
  const map = {
    won: { text: "猜中", cls: "bg-emerald-500 text-white" },
    lost: { text: "毒奶", cls: "bg-red-400 text-white" },
    // pending = 未结算：已开赛但还没出结果是「待结算」，未开赛才是「未开赛」
    pending: hasStarted(match)
      ? { text: "待结算", cls: "bg-amber-300 text-teal-deep" }
      : { text: "未开赛", cls: "bg-gray-300 text-teal-deep" },
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
