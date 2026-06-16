/**
 * the-odds-api.com 封装。
 * sport key = soccer_fifa_world_cup（一个 API 覆盖：未开赛赛程+时间、赔率、赛后比分）。
 * 文档：https://the-odds-api.com/liveapi/guides/v4/
 */

const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "soccer_fifa_world_cup";

function apiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("缺少 ODDS_API_KEY 环境变量");
  return key;
}

interface OddsOutcome {
  name: string;
  price: number;
}
interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}
interface OddsBookmaker {
  key: string;
  markets: OddsMarket[];
}
interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface UpcomingMatch {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
}

/**
 * 三路赔率合理性检查，过滤上游偶发的错价快照。
 * - 小数赔率必须都 > 1。
 * - 归一化后「平局」隐含概率不应过高：真实三路盘口里平局极少超过 ~40%，
 *   这里放宽到 50% 作为护栏。曾出现过 France/Senegal 被错标成
 *   平 1.2 / 主 5.25（平局隐含 ~75%）的脏数据，靠这条拦下。
 */
function plausibleH2H(home: number, draw: number, away: number): boolean {
  if (!(home > 1) || !(draw > 1) || !(away > 1)) return false;
  const pHome = 1 / home;
  const pDraw = 1 / draw;
  const pAway = 1 / away;
  return pDraw / (pHome + pDraw + pAway) <= 0.5;
}

/**
 * 拉取未开赛比赛 + 三路赔率（主胜/平/客胜，欧洲盘口=小数赔率）。
 * 取第一个有完整、且通过合理性检查的 h2h 盘口的 bookmaker。
 */
export async function getUpcomingMatches(): Promise<UpcomingMatch[]> {
  const url = `${BASE}/sports/${SPORT}/odds?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`odds API ${res.status}: ${await res.text()}`);
  }
  const events: OddsEvent[] = await res.json();

  return events.map((ev) => {
    let oddsHome: number | null = null;
    let oddsDraw: number | null = null;
    let oddsAway: number | null = null;

    for (const bm of ev.bookmakers ?? []) {
      const h2h = bm.markets?.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const home = h2h.outcomes.find((o) => o.name === ev.home_team)?.price;
      const away = h2h.outcomes.find((o) => o.name === ev.away_team)?.price;
      const draw = h2h.outcomes.find((o) => o.name === "Draw")?.price;
      if (home && away && draw && plausibleH2H(home, draw, away)) {
        oddsHome = home;
        oddsDraw = draw;
        oddsAway = away;
        break;
      }
    }

    return {
      id: ev.id,
      commenceTime: ev.commence_time,
      homeTeam: ev.home_team,
      awayTeam: ev.away_team,
      oddsHome,
      oddsDraw,
      oddsAway,
    };
  });
}

interface ScoreEntry {
  name: string;
  score: string;
}
interface ScoreEvent {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: ScoreEntry[] | null;
}

export interface FinishedMatch {
  id: string;
  homeScore: number;
  awayScore: number;
  result: "home" | "draw" | "away";
}

/**
 * 拉取最近已结束比赛的比分（daysFrom 最多 3）。只返回 completed 且有比分的。
 */
export async function getFinishedMatches(daysFrom = 3): Promise<FinishedMatch[]> {
  const url = `${BASE}/sports/${SPORT}/scores?daysFrom=${daysFrom}&apiKey=${apiKey()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`scores API ${res.status}: ${await res.text()}`);
  }
  const events: ScoreEvent[] = await res.json();

  const finished: FinishedMatch[] = [];
  for (const ev of events) {
    if (!ev.completed || !ev.scores) continue;
    const home = ev.scores.find((s) => s.name === ev.home_team);
    const away = ev.scores.find((s) => s.name === ev.away_team);
    if (!home || !away) continue;
    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;

    finished.push({
      id: ev.id,
      homeScore,
      awayScore,
      result:
        homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw",
    });
  }
  return finished;
}
