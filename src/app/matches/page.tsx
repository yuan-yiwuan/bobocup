import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Bet, Match, Team } from "@/lib/types";
import MatchesView from "./MatchesView";

export const dynamic = "force-dynamic";

// 暂时隐藏淘汰赛（本周日 2026-06-28 起开打，PT 00:00 = 07:00 UTC），
// 等淘汰赛玩法改好后再放开 / 删除这条上限。
const KNOCKOUT_CUTOFF = "2026-06-28T07:00:00Z";

export default async function MatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, home_team_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.nickname) redirect("/onboarding");

  const nowIso = new Date().toISOString();

  const [{ data: matches }, { data: teams }, { data: bets }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("*")
        .gt("commence_time", nowIso)
        .lt("commence_time", KNOCKOUT_CUTOFF)
        .order("commence_time"),
      supabase.from("teams").select("*"),
      supabase.from("bets").select("*").eq("user_id", user.id),
    ]);

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <MatchesView
          matches={(matches ?? []) as Match[]}
          teams={(teams ?? []) as Team[]}
          initialBets={(bets ?? []) as Bet[]}
          userId={user.id}
          userHomeTeamId={profile.home_team_id ?? null}
        />
      </main>
    </>
  );
}
