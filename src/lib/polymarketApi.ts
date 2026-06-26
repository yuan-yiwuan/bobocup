/**
 * Polymarket（Gamma API）封装 —— 取淘汰赛「晋级概率」。
 *
 * 公开免认证，价格本身就是隐含概率（0–1）。文档：
 * https://docs.polymarket.com/developers/gamma-markets-api/overview
 *
 * 思路：每一轮淘汰赛对应一个「某队进入下一阶段」的盘（reach-stage）。
 * 对阵确定后，「A 进下一轮」就等于「A 赢这一场」（已含加时/点球）。
 * 这些盘不是 negRisk（各队独立定价、互不互斥），所以两队都读、再归一化，
 * 既补上「不互斥」的缺口，也顺手去掉水位。
 */

const BASE = "https://gamma-api.polymarket.com";

/** 淘汰赛轮次 → 对应「进入下一阶段」的 Gamma event slug（均已核实存在） */
export const ROUND_SLUGS = {
  /** R32 这一场（32→16）：晋级 = 进 16 强 */
  round_of_32: "world-cup-nation-to-reach-round-of-16",
  /** R16 这一场（16→8）：晋级 = 进 8 强 */
  round_of_16: "world-cup-nation-to-reach-quarterfinals",
  /** 1/4 决赛（8→4）：晋级 = 进 4 强 */
  quarterfinal: "world-cup-nation-to-reach-semifinals",
  /** 半决赛（4→2）：晋级 = 进决赛 */
  semifinal: "world-cup-nation-to-reach-final",
  /** 决赛（2→1）：晋级 = 夺冠 */
  final: "world-cup-winner",
} as const;

export type KnockoutRound = keyof typeof ROUND_SLUGS;

interface GammaMarket {
  groupItemTitle?: string;
  question?: string;
  outcomes?: string; // JSON 字符串，如 '["Yes","No"]'
  outcomePrices?: string; // JSON 字符串，如 '["0.1365","0.8635"]'
  active?: boolean;
  closed?: boolean;
}
interface GammaEvent {
  slug: string;
  title: string;
  markets: GammaMarket[];
}

/** outcomes / outcomePrices 在 Gamma 里是 JSON 字符串，安全解析成数组 */
function parseJsonArray(v: string | undefined): string[] {
  if (typeof v !== "string") return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * 队名归一化：用于跨数据源匹配（Polymarket / openfootball / teams 表三方对齐）。
 * 去音符（Curaçao→curacao）、& → and、压空格、小写。
 */
function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * 拉某个 reach-stage 盘，返回 归一化队名 → Yes 隐含概率（0–1）。
 * 只收 active 且未结算、且能解出 Yes 价的子市场。
 */
async function fetchReachProbabilities(slug: string): Promise<Map<string, number>> {
  const res = await fetch(`${BASE}/events?slug=${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`polymarket events ${res.status}: ${await res.text()}`);
  }
  const events: GammaEvent[] = await res.json();
  const event = events[0];
  if (!event) throw new Error(`polymarket: 未找到 event slug=${slug}`);

  const out = new Map<string, number>();
  for (const m of event.markets ?? []) {
    if (m.closed) continue;
    const team = m.groupItemTitle;
    if (!team) continue;
    const outcomes = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices);
    const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
    const yes = Number(prices[yesIdx >= 0 ? yesIdx : 0]);
    if (!Number.isFinite(yes)) continue;
    out.set(normName(team), yes);
  }
  return out;
}

export interface AdvanceProb {
  /** 队名（原样回传调用方传入的字符串） */
  team: string;
  /** 晋级概率（两队归一化后，0–1，相加=1） */
  prob: number;
  /** 归一化前的市场原始 Yes 价，便于排查水位/流动性 */
  rawYes: number;
}

/**
 * 取一场淘汰赛的双方晋级概率。
 * - teamA / teamB 用英文队名（与 teams.name_en 一致；需与 Polymarket 命名对齐）。
 * - 找不到任一方（盘未开 / 命名不匹配 / 对阵未锁定）返回 null，调用方据此兜底
 *   （比如退回 oddsApi 的 h2h 推导）。
 */
export async function getAdvanceProb(
  teamA: string,
  teamB: string,
  round: KnockoutRound,
): Promise<{ a: AdvanceProb; b: AdvanceProb } | null> {
  const probs = await fetchReachProbabilities(ROUND_SLUGS[round]);
  const yesA = probs.get(normName(teamA));
  const yesB = probs.get(normName(teamB));
  if (yesA == null || yesB == null) return null;

  const sum = yesA + yesB;
  if (!(sum > 0)) return null;

  return {
    a: { team: teamA, prob: yesA / sum, rawYes: yesA },
    b: { team: teamB, prob: yesB / sum, rawYes: yesB },
  };
}
