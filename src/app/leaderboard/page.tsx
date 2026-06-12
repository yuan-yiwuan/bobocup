import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Bet, LeaderboardRow, Match, Team } from "@/lib/types";
import { getLastSettleRun } from "@/lib/meta";
import { settleRunLabel } from "@/lib/format";
import LeaderboardView from "./LeaderboardView";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.nickname) redirect("/onboarding");

  const [{ data: rows }, { data: bets }, { data: matches }, { data: teams }] =
    await Promise.all([
      supabase
        .from("leaderboard")
        .select("*")
        .order("milk_index", { ascending: false, nullsFirst: false }),
      supabase.from("bets").select("*"),
      supabase.from("matches").select("*"),
      supabase.from("teams").select("*"),
    ]);

  const lastSettleRun = await getLastSettleRun(supabase);

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <h1 className="text-2xl font-black text-teal-deep mb-1">🥛 毒奶排行榜</h1>
        <p className="text-sm text-teal-deep/60 font-semibold mb-1">
          毒奶指数越高越毒 · 点开看每个人的投注战绩
        </p>
        {lastSettleRun && (
          <p className="text-xs text-teal-deep/40 font-semibold mb-4">
            🔄 上次结算检查：{settleRunLabel(lastSettleRun)}
          </p>
        )}
        <LeaderboardView
          rows={(rows ?? []) as LeaderboardRow[]}
          bets={(bets ?? []) as Bet[]}
          matches={(matches ?? []) as Match[]}
          teams={(teams ?? []) as Team[]}
          currentUserId={user.id}
        />
      </main>
    </>
  );
}
