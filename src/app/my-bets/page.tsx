import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Bet, Match, Team } from "@/lib/types";
import MyBetsView from "./MyBetsView";

export const dynamic = "force-dynamic";

export default async function MyBetsPage() {
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

  const [{ data: bets }, { data: matches }, { data: teams }] =
    await Promise.all([
      supabase
        .from("bets")
        .select("*")
        .eq("user_id", user.id),
      supabase.from("matches").select("*"),
      supabase.from("teams").select("*"),
    ]);

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <h1 className="text-2xl font-black text-teal-deep mb-1">📋 我的投注</h1>
        <p className="text-sm text-teal-deep/60 font-semibold mb-4">
          未开赛的可以直接改注或取消。
        </p>
        <MyBetsView
          bets={(bets ?? []) as Bet[]}
          matches={(matches ?? []) as Match[]}
          teams={(teams ?? []) as Team[]}
          userId={user.id}
          userHomeTeamId={profile.home_team_id ?? null}
        />
      </main>
    </>
  );
}
