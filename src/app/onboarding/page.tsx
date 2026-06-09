import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayingTeams } from "@/lib/playingTeams";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
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

  const teams = await getPlayingTeams(supabase);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-5 py-10">
      <div className="cartoon-card w-full max-w-md p-6">
        <h1 className="text-2xl font-black text-teal-deep mb-1">🎉 欢迎加入波波杯</h1>
        <p className="text-teal-deep/70 font-semibold mb-5 text-sm">
          设置一下昵称和你的主队，就可以开始竞猜啦。
        </p>
        <OnboardingForm
          teams={teams}
          initialNickname={profile?.nickname ?? ""}
          initialHomeTeam={profile?.home_team_id ?? null}
        />
      </div>
    </main>
  );
}
