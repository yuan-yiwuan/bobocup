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
import { pacificDate } from "@/lib/leaderboard";

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

  const nowIso = new Date().toISOString();

  const [
    { data: matches },
    { data: teams },
    { data: bets },
    { data: outrightMarkets },
    { data: outrightOutcomes },
    { data: outrightBets },
    { data: dailyMarketRow },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select("*")
      .gt("commence_time", nowIso)
      .order("commence_time"),
    supabase.from("teams").select("*"),
    supabase.from("bets").select("*").eq("user_id", user.id),
    // 长期盘（金靴/夺冠），不含每日
    supabase.from("outright_markets").select("*").neq("kind", "daily").order("kind"),
    supabase.from("outright_outcomes").select("*"),
    supabase.from("outright_bets").select("*").eq("user_id", user.id),
    // 今日的每日竞猜
    supabase
      .from("outright_markets")
      .select("*")
      .eq("kind", "daily")
      .eq("featured_date", pacificDate())
      .maybeSingle(),
  ]);

  const allOutcomes = (outrightOutcomes ?? []) as OutrightOutcome[];
  const allOutrightBets = (outrightBets ?? []) as OutrightBet[];
  const dailyMarket = (dailyMarketRow ?? null) as OutrightMarket | null;
  const dailyOutcomes = dailyMarket
    ? allOutcomes
        .filter((o) => o.market_id === dailyMarket.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  const dailyBet = dailyMarket
    ? allOutrightBets.find((b) => b.market_id === dailyMarket.id) ?? null
    : null;

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-5">
        <BettingTabs
          matches={(matches ?? []) as Match[]}
          teams={(teams ?? []) as Team[]}
          initialBets={(bets ?? []) as Bet[]}
          userId={user.id}
          userHomeTeamId={profile.home_team_id ?? null}
          outrightMarkets={(outrightMarkets ?? []) as OutrightMarket[]}
          outrightOutcomes={allOutcomes}
          outrightBets={allOutrightBets}
          dailyMarket={dailyMarket}
          dailyOutcomes={dailyOutcomes}
          dailyBet={dailyBet}
        />
      </main>
    </>
  );
}
