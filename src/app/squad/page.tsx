import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SquadIndexPage() {
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

  const [{ data: teams }, { data: squadRows }] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("squad_teams").select("team_id"),
  ]);

  const squadSet = new Set(
    ((squadRows ?? []) as { team_id: number }[]).map((r) => r.team_id),
  );

  const withSquad = ((teams ?? []) as Team[])
    .filter((t) => squadSet.has(t.id))
    .sort((a, b) => a.name_zh.localeCompare(b.name_zh, "zh"));

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <h1 className="text-xl font-black text-teal-deep mb-4">👥 球队大名单</h1>

        {withSquad.length === 0 ? (
          <div className="cartoon-card p-8 text-center text-teal-deep font-bold">
            ⏳ 名单还没导入
            <p className="font-normal text-sm text-teal-deep/60 mt-2">
              运行 scripts/seed-squads.mjs 后即可查看各队大名单。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {withSquad.map((t) => (
              <Link
                key={t.id}
                href={`/squad/${t.id}`}
                className="cartoon-card p-4 flex items-center gap-2 hover:bg-teal-50"
              >
                <span className="text-2xl shrink-0">{t.flag_emoji ?? "⚽"}</span>
                <span className="block font-black text-teal-deep truncate min-w-0">
                  {t.name_zh}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
