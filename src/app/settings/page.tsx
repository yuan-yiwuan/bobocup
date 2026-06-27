import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import { getPlayingTeams } from "@/lib/playingTeams";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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

  const teams = await getPlayingTeams(supabase);

  // 仍在比赛中的球队 = 有未开赛比赛的队。主队不在其中即「已被淘汰」，可改选。
  const { data: upcoming } = await supabase
    .from("matches")
    .select("home_team_id, away_team_id")
    .eq("status", "scheduled")
    .gt("commence_time", new Date().toISOString());
  const aliveIds = new Set<number>();
  for (const m of upcoming ?? []) {
    if (m.home_team_id) aliveIds.add(m.home_team_id);
    if (m.away_team_id) aliveIds.add(m.away_team_id);
  }
  const homeTeam = profile.home_team_id ?? null;
  const homeTeamEliminated = homeTeam != null && !aliveIds.has(homeTeam);

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-md px-4 py-6">
        <h1 className="text-2xl font-black text-teal-deep mb-1">⚙️ 个人设置</h1>
        <p className="text-sm text-teal-deep/60 font-semibold mb-4">
          随时修改昵称和主队。
        </p>
        <div className="cartoon-card p-6">
          <SettingsForm
            teams={teams}
            initialNickname={profile.nickname}
            initialHomeTeam={homeTeam}
            homeTeamEliminated={homeTeamEliminated}
            aliveTeamIds={Array.from(aliveIds)}
          />
        </div>
      </main>
    </>
  );
}
