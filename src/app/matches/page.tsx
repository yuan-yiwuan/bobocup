import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import type {
  Bet,
  Match,
  OutrightBet,
  OutrightMarket,
  OutrightOutcome,
  Team,
} from "@/lib/types";
import BettingTabs from "./BettingTabs";

export const dynamic = "force-dynamic";

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

  const [
    { data: matches },
    { data: teams },
    { data: bets },
    { data: outrightMarkets },
    { data: outrightOutcomes },
    { data: outrightBets },
    { data: profileRows },
    { data: allMatchBetRows },
  ] = await Promise.all([
    // 未结算的比赛都显示（含已开赛未结算的，灰显禁投）
    supabase
      .from("matches")
      .select("*")
      .eq("settled", false)
      .order("commence_time"),
    supabase.from("teams").select("*"),
    supabase.from("bets").select("*").eq("user_id", user.id),
    // 长期盘（金靴/夺冠/胡萝卜王），不含每日竞猜
    supabase
      .from("outright_markets")
      .select("*")
      .neq("kind", "daily")
      .order("kind"),
    supabase.from("outright_outcomes").select("*"),
    // 所有人的特别竞猜注单（用于「大家的竞猜」）
    supabase.from("outright_bets").select("*"),
    supabase.from("profiles").select("id, nickname"),
    // 所有人的比赛注单（用于比赛卡「大家的竞猜」，含 stake 以显示倍数）
    supabase.from("bets").select("user_id, match_id, pick, stake"),
  ]);

  const allMatchBets = (allMatchBetRows ?? []) as {
    user_id: string;
    match_id: string;
    pick: Bet["pick"];
    stake: number;
  }[];
  const allOutcomes = (outrightOutcomes ?? []) as OutrightOutcome[];
  const allOutrightBets = (outrightBets ?? []) as OutrightBet[];
  const nameById: Record<string, string> = Object.fromEntries(
    (profileRows ?? []).map((p) => [p.id as string, (p.nickname as string) ?? "神秘人"]),
  );

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <BettingTabs
          matches={(matches ?? []) as Match[]}
          teams={(teams ?? []) as Team[]}
          initialBets={(bets ?? []) as Bet[]}
          matchPeerBets={allMatchBets}
          userId={user.id}
          userHomeTeamId={profile.home_team_id ?? null}
          outrightMarkets={(outrightMarkets ?? []) as OutrightMarket[]}
          outrightOutcomes={allOutcomes}
          outrightBets={allOutrightBets}
          nameById={nameById}
        />
      </main>
    </>
  );
}
