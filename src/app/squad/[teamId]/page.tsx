import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type { Player, Team } from "@/lib/types";
import { formatMarketValue } from "@/lib/format";

export const dynamic = "force-dynamic";

// 各来源页对应的返回文案
const BACK_LABELS: Record<string, string> = {
  "/squad": "所有球队",
  "/matches": "竞猜",
  "/my-bets": "我的竞猜",
  "/leaderboard": "排行榜",
  "/": "首页",
};

/** 根据 ?from= 决定返回去向；只接受站内绝对路径，避免开放重定向。默认回大名单列表。 */
function resolveBack(from: string | string[] | undefined): {
  href: string;
  label: string;
} {
  const raw = Array.isArray(from) ? from[0] : from;
  const safe = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  if (!safe) return { href: "/squad", label: "所有球队" };
  const path = safe.split("?")[0];
  return { href: safe, label: BACK_LABELS[path] ?? "返回" };
}

export default async function SquadPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { teamId } = await params;
  const back = resolveBack((await searchParams).from);
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
          href={back.href}
          className="text-sm font-bold text-teal-deep/60 hover:text-teal-brand"
        >
          ← {back.label}
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
          <div className="flex flex-col gap-2">
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
  const tmUrl = p.tm_player_id
    ? `https://www.transfermarkt.com/-/profil/spieler/${p.tm_player_id}`
    : null;

  const inner = (
    <>
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
        <p className="font-bold text-teal-deep truncate">
          {p.shirt_number != null && (
            <span className="text-teal-deep/40 mr-2">{p.shirt_number}</span>
          )}
          {p.name}
          {tmUrl && <span className="text-teal-deep/30 text-xs ml-1">↗</span>}
        </p>
        <p className="text-xs text-teal-deep/55 font-semibold truncate mt-0.5">
          {p.position && (
            <span className="text-teal-brand">{POS_LABEL[p.position] ?? p.position}</span>
          )}
          {p.position && p.club && " · "}
          {p.club}
        </p>
      </div>
      <span className="text-base font-black text-teal-deep shrink-0">
        {formatMarketValue(p.market_value)}
      </span>
    </>
  );

  const cls = "cartoon-card p-2.5 flex items-center gap-3";
  return tmUrl ? (
    <a
      href={tmUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${cls} hover:bg-teal-50`}
      title={`在 Transfermarkt 查看 ${p.name}`}
    >
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
