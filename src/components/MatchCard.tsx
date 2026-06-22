"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Match, Pick } from "@/lib/types";
import {
  homeTeamPick,
  hasStarted,
  humanizeBetError,
  pickOdds,
} from "@/lib/bets";
import {
  formatOdds,
  matchDateKey,
  matchTime,
  pickLabel,
  sideLabel,
  type TeamMap,
} from "@/lib/format";

const PICKS: Pick[] = ["home", "draw", "away"];

export default function MatchCard({
  match,
  teams,
  userId,
  userHomeTeamId,
  initialPick,
  initialStake,
  showDate = false,
}: {
  match: Match;
  teams: TeamMap;
  userId: string;
  userHomeTeamId: number | null;
  initialPick: Pick | null;
  initialStake: number;
  showDate?: boolean;
}) {
  const [pick, setPick] = useState<Pick | null>(initialPick);
  const [stake, setStake] = useState<number>(initialStake);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const htPick = homeTeamPick(match, userHomeTeamId);
  const started = hasStarted(match);
  const multiplier = Math.round(stake / 100);

  // 让大名单页知道是从哪个页面（连带日期/筛选）点进去的，返回时回到原样
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  const squadFrom = `?from=${encodeURIComponent(
    qs ? `${pathname}?${qs}` : pathname,
  )}`;

  async function save(nextPick: Pick, nextStake: number) {
    const supabase = createClient();
    const { error } = await supabase.from("bets").upsert(
      {
        user_id: userId,
        match_id: match.id,
        pick: nextPick,
        stake: nextStake,
        odds_snapshot: pickOdds(match, nextPick),
      },
      { onConflict: "user_id,match_id" },
    );
    return error?.message ?? null;
  }

  async function onPick(p: Pick) {
    if (busy || started) return;
    setErr(null);
    setBusy(true);
    const prevPick = pick;
    const prevStake = stake;

    if (pick === p) {
      // 再点一次 = 取消投注
      setPick(null);
      setStake(100);
      const supabase = createClient();
      const { error } = await supabase
        .from("bets")
        .delete()
        .eq("user_id", userId)
        .eq("match_id", match.id);
      if (error) {
        setPick(prevPick);
        setStake(prevStake);
        setErr(humanizeBetError(error.message));
      }
    } else {
      // 主队的比赛：胜/平/负切换都保留倍数；非主队比赛一律 100
      const nextStake = htPick != null ? stake : 100;
      setPick(p);
      setStake(nextStake);
      const msg = await save(p, nextStake);
      if (msg) {
        setPick(prevPick);
        setStake(prevStake);
        setErr(humanizeBetError(msg));
      }
    }
    setBusy(false);
  }

  async function onMultiplier(m: number) {
    if (busy || started || htPick == null || pick == null) return;
    setErr(null);
    setBusy(true);
    const prev = stake;
    const nextStake = 100 * m;
    setStake(nextStake);
    const msg = await save(pick, nextStake);
    if (msg) {
      setStake(prev);
      setErr(humanizeBetError(msg));
    }
    setBusy(false);
  }

  return (
    <div className="cartoon-card p-4">
      <div className="flex items-center justify-between text-xs font-bold text-teal-deep/60 mb-2">
        <span>
          {showDate && `${matchDateKey(match.commence_time)} · `}
          🕐 {matchTime(match.commence_time)}
        </span>
        {pick && (
          <span className="text-teal-deep">
            已投 🥕{stake} · {pickLabel(match, pick, teams)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 font-black text-teal-deep text-lg mb-3">
        <span className="flex-1 text-right">
          {sideLabel(match, "home", teams)}
          {htPick === "home" && <HomeTag />}
        </span>
        <span className="text-teal-deep/40 text-sm">VS</span>
        <span className="flex-1 text-left">
          {sideLabel(match, "away", teams)}
          {htPick === "away" && <HomeTag />}
        </span>
      </div>

      {(match.home_team_id != null || match.away_team_id != null) && (
        <div className="flex items-center justify-center gap-2 text-xs -mt-1 mb-3">
          <span className="flex-1 text-right">
            {match.home_team_id != null && (
              <Link
                href={`/squad/${match.home_team_id}${squadFrom}`}
                className="text-teal-deep/55 hover:text-teal-brand font-semibold"
              >
                📋 大名单
              </Link>
            )}
          </span>
          <span className="w-6 shrink-0" />
          <span className="flex-1 text-left">
            {match.away_team_id != null && (
              <Link
                href={`/squad/${match.away_team_id}${squadFrom}`}
                className="text-teal-deep/55 hover:text-teal-brand font-semibold"
              >
                📋 大名单
              </Link>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {PICKS.map((p) => {
          const selected = pick === p;
          return (
            <button
              key={p}
              disabled={busy || started}
              onClick={() => onPick(p)}
              className={`cartoon-btn px-2 py-2 flex flex-col items-center ${
                selected
                  ? "bg-yellow-300 text-teal-deep"
                  : "bg-white text-teal-deep"
              }`}
            >
              <span className="text-sm leading-tight text-center">
                {p === "draw" ? "平局" : `${sideLabel(match, p, teams)}胜`}
              </span>
              <span className="text-xs opacity-70">
                {formatOdds(pickOdds(match, p))}
              </span>
            </button>
          );
        })}
      </div>

      {/* 主队加成：自己主队的比赛，胜/平/负任选都可 1~3 倍 */}
      {htPick && (
        <div
          className={`mt-3 flex items-center gap-2 ${
            pick != null ? "" : "opacity-40"
          }`}
        >
          <span className="text-xs font-bold text-teal-deep shrink-0">
            🥕 主队加成
          </span>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((m) => (
              <button
                key={m}
                disabled={busy || started || pick == null}
                onClick={() => onMultiplier(m)}
                className={`w-8 h-8 cartoon-btn text-sm ${
                  pick != null && multiplier === m
                    ? "bg-teal-brand text-white"
                    : "bg-white text-teal-deep"
                }`}
              >
                {m}×
              </button>
            ))}
          </div>
        </div>
      )}

      {started && (
        <p className="mt-2 text-xs text-teal-deep/50 font-semibold">
          已开赛，无法修改
        </p>
      )}
      {err && (
        <p className="mt-2 text-xs text-red-600 font-semibold">{err}</p>
      )}
    </div>
  );
}

function HomeTag() {
  return (
    <span className="ml-1 align-middle text-[10px] bg-teal-brand text-white px-1 py-0.5 rounded-full">
      主队
    </span>
  );
}
