import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Team } from "@/lib/types";
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

  const { data: teams } = await supabase
    .from("teams")
    .select("*")
    .order("name_zh");

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
            teams={(teams ?? []) as Team[]}
            initialNickname={profile.nickname}
            initialHomeTeam={profile.home_team_id ?? null}
          />
        </div>
      </main>
    </>
  );
}
