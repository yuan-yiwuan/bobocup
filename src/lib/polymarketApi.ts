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

import { teamKey } from "./teamNames";

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
  image?: string;
  icon?: string;
}
interface GammaEvent {
  slug: string;
  title: string;
  closed?: boolean;
  markets: GammaMarket[];
}

/** outright/futures 长期盘的 slug（与单场无关）。均已核实存在。 */
export const OUTRIGHT_SLUGS = {
  golden_boot: "world-cup-golden-boot-winner",
  champion: "world-cup-winner",
} as const;

export type OutrightKind = keyof typeof OUTRIGHT_SLUGS;

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
 * Polymarket 给多选盘挂的「Other」兜底子市场基本没人交易，Yes 价常年停在
 * 0.5 默认中点（→ 倍数恒为 2.00），不是真实概率，所以直接剔除不作为选项。
 */
function isOtherOutcome(name: string | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === "other";
}

/** 队名归一化：跨数据源匹配统一走 teamKey（含别名表）。 */
const normName = teamKey;

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

// ── outright / futures 长期盘（金靴、夺冠……） ──────────────────────

export interface OutrightOutcome {
  /** Polymarket groupItemTitle，如 "Lionel Messi" / "France" */
  name: string;
  /** 当前隐含概率（Yes 价，0–1） */
  prob: number;
  /** 选项图片（球员头像 / 队徽），可空 */
  image: string | null;
  /** 该子市场是否已结算 */
  closed: boolean;
  /** 是否已结算为获胜项（closed 且 Yes≈1） */
  isWinner: boolean;
}

export interface OutrightMarket {
  slug: string;
  outcomes: OutrightOutcome[];
  /** 整盘是否已分晓（存在获胜项） */
  resolved: boolean;
  /** 获胜项名（未分晓为 null） */
  winnerName: string | null;
}

/**
 * 拉一个 outright 盘（金靴/夺冠这类多选互斥盘，negRisk）。
 * 这些盘是几十个 Yes/No 子市场，Yes 价之和 ≈ 1，可直接当瓜分概率。
 * 结算：某子市场 closed 且 Yes≈1 即为获胜项（被淘汰的项 closed 且 Yes≈0）。
 */
export async function getOutrightMarket(slug: string): Promise<OutrightMarket> {
  const res = await fetch(`${BASE}/events?slug=${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`polymarket events ${res.status}: ${await res.text()}`);
  }
  const events: GammaEvent[] = await res.json();
  const event = events[0];
  if (!event) throw new Error(`polymarket: 未找到 event slug=${slug}`);

  const outcomes: OutrightOutcome[] = [];
  let winnerName: string | null = null;
  for (const m of event.markets ?? []) {
    const name = m.groupItemTitle;
    if (!name || isOtherOutcome(name)) continue;
    const labels = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices);
    const yesIdx = labels.findIndex((o) => o.toLowerCase() === "yes");
    const yes = Number(prices[yesIdx >= 0 ? yesIdx : 0]);
    if (!Number.isFinite(yes)) continue;
    const closed = !!m.closed;
    const isWinner = closed && yes >= 0.9;
    if (isWinner) winnerName = name;
    outcomes.push({
      name,
      prob: yes,
      image: m.image ?? m.icon ?? null,
      closed,
      isWinner,
    });
  }
  // 概率高到低
  outcomes.sort((a, b) => b.prob - a.prob);
  return { slug, outcomes, resolved: winnerName != null, winnerName };
}

// ── 每日竞猜：通用单盘读取（二元 Yes/No 或多选 negRisk 都支持） ──────

export interface DailyMarket {
  slug: string;
  title: string;
  outcomes: OutrightOutcome[];
  /** 任一选项的最高概率（用于「无选项 >80%」筛选） */
  maxProb: number;
  resolved: boolean;
  winnerName: string | null;
  /** Polymarket 上整盘是否已结束 */
  closed: boolean;
}

/**
 * 拉一个任意 Polymarket 盘并归一成可投选项：
 *  - 二元单盘（一个 market，outcomes 如 ["Yes","No"] 或两个名字）→ 两个选项；
 *  - 多选 negRisk（多个子 market，groupItemTitle 为选项名）→ 每个子市场一个选项。
 * 给每日竞猜的「实时校验」和「选项落库」共用。
 */
export async function getDailyMarket(slug: string): Promise<DailyMarket> {
  const res = await fetch(`${BASE}/events?slug=${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`polymarket events ${res.status}: ${await res.text()}`);
  }
  const events: GammaEvent[] = await res.json();
  const event = events[0];
  if (!event) throw new Error(`polymarket: 未找到 event slug=${slug}`);

  const ms = event.markets ?? [];
  const outcomes: OutrightOutcome[] = [];

  if (ms.length === 1 && !ms[0].groupItemTitle) {
    // 二元单盘：两个 outcome 标签各算一个选项
    const m = ms[0];
    const labels = parseJsonArray(m.outcomes);
    const prices = parseJsonArray(m.outcomePrices);
    labels.forEach((label, i) => {
      const p = Number(prices[i]);
      if (!Number.isFinite(p)) return;
      outcomes.push({
        name: label,
        prob: p,
        image: m.image ?? m.icon ?? null,
        closed: !!m.closed,
        isWinner: !!m.closed && p >= 0.9,
      });
    });
  } else {
    // 多选 negRisk：每个子市场的 Yes 价
    for (const m of ms) {
      const name = m.groupItemTitle;
      if (!name || isOtherOutcome(name)) continue;
      const labels = parseJsonArray(m.outcomes);
      const prices = parseJsonArray(m.outcomePrices);
      const yesIdx = labels.findIndex((o) => o.toLowerCase() === "yes");
      const yes = Number(prices[yesIdx >= 0 ? yesIdx : 0]);
      if (!Number.isFinite(yes)) continue;
      outcomes.push({
        name,
        prob: yes,
        image: m.image ?? m.icon ?? null,
        closed: !!m.closed,
        isWinner: !!m.closed && yes >= 0.9,
      });
    }
  }

  outcomes.sort((a, b) => b.prob - a.prob);
  const winnerName = outcomes.find((o) => o.isWinner)?.name ?? null;
  const maxProb = outcomes.reduce((mx, o) => Math.max(mx, o.prob), 0);
  return {
    slug,
    title: event.title,
    outcomes,
    maxProb,
    resolved: winnerName != null,
    winnerName,
    closed: !!event.closed,
  };
}
