import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Player, Team } from "@/lib/types";
import { formatMarketValue } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SquadPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const id = Number(teamId);
  if (!Number.isInteger(id)) notFound();

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

  const [{ data: team }, { data: playerRows }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("players")
      .select("*")
      .eq("team_id", id)
      .order("market_value", { ascending: false, nullsFirst: false }),
  ]);

  if (!team) notFound();
  const t = team as Team;
  const players = (playerRows ?? []) as Player[];

  const totalValue = players.reduce((s, p) => s + (p.market_value ?? 0), 0);

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <Link
          href="/squad"
          className="text-sm font-bold text-teal-deep/60 hover:text-teal-brand"
        >
          ← 所有球队
        </Link>

        <div className="cartoon-card p-4 mt-2 mb-4 flex items-center gap-3">
          <span className="text-4xl shrink-0">{t.flag_emoji ?? "⚽"}</span>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-teal-deep">{t.name_zh}</h1>
            <p className="text-xs font-semibold text-teal-deep/60">
              {players.length} 名球员 · 总身价 {formatMarketValue(totalValue)}
            </p>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="cartoon-card p-8 text-center text-teal-deep/70 font-semibold">
            这支球队还没有名单数据
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {players.map((p) => (
              <PlayerRow key={p.id} p={p} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

const POS_LABEL: Record<string, string> = {
  GK: "门将",
  DF: "后卫",
  MF: "中场",
  FW: "前锋",
};

function PlayerRow({ p }: { p: Player }) {
  return (
    <div className="cartoon-card p-2 flex items-center gap-2">
      {p.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.photo_url}
          alt={p.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-16 h-16 rounded-lg object-cover bg-teal-50 shrink-0"
        />
      ) : (
        <span className="w-16 h-16 rounded-lg bg-teal-50 grid place-items-center text-xl shrink-0">
          👤
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-teal-deep truncate leading-tight">
          {p.shirt_number != null && (
            <span className="text-teal-deep/40 mr-1">{p.shirt_number}</span>
          )}
          {p.name}
        </p>
        <p className="text-[11px] text-teal-deep/55 font-semibold truncate leading-tight mt-0.5">
          {p.position && (
            <span className="text-teal-brand">{POS_LABEL[p.position] ?? p.position}</span>
          )}
          {p.position && p.club && " · "}
          {p.club}
        </p>
        <p className="text-xs font-black text-teal-deep leading-tight mt-1">
          {formatMarketValue(p.market_value)}
        </p>
      </div>
    </div>
  );
}
