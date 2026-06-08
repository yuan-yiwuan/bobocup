import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Bet, Match, Team } from "@/lib/types";
import MatchesView from "./MatchesView";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
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

  const nowIso = new Date().toISOString();

  const [{ data: matches }, { data: teams }, { data: bets }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("*")
        .gt("commence_time", nowIso)
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
        />
      </main>
    </>
  );
}
