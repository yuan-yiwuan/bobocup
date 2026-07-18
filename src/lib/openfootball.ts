/**
 * openfootball/worldcup.json 封装 —— 2026 世界杯淘汰赛赛程 + 赛果。
 *
 * - 赛程：对阵 + 开赛时间（真队名才返回，占位如 "W74"/"3A/B/C" 自动滤掉）。
 * - 赛果：含「谁晋级」（按 点球 p → 加时 et → 常规 ft 的顺序判定胜者），
 *   这是 the-odds-api 的 /scores 给不了的关键能力。
 * 数据源：https://github.com/openfootball/worldcup.json
 */

const SOURCE =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/** openfootball 的淘汰赛轮次名 → 我们的轮次 key。 */
const KNOCKOUT_ROUNDS: Record<string, KnockoutRoundKey> = {
  "Round of 32": "round_of_32",
  "Round of 16": "round_of_16",
  "Quarter-final": "quarterfinal",
  "Semi-final": "semifinal",
  // 季军赛：无「晋级」概念，胜者夺季军。复用两路玩法，赔率取 Polymarket「谁获第三名」盘。
  "Match for third place": "third_place",
  Final: "final",
};

export type KnockoutRoundKey =
  | "round_of_32"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "third_place"
  | "final";

interface OfMatch {
  round?: string;
  date?: string;
  time?: string;
  team1?: string;
  team2?: string;
  group?: string;
  ground?: string;
  score?: {
    p?: [number, number]; // 点球
    et?: [number, number]; // 加时后
    ft?: [number, number]; // 常规时间后
    ht?: [number, number];
  };
}

export interface KnockoutFixture {
  /** 稳定主键：openfootball 按序号引用比赛（如 "W74"），用数组序号生成 */
  id: string;
  round: KnockoutRoundKey;
  /** 原始队名（openfootball 写法，调用方需自行映射到 teams） */
  team1: string;
  team2: string;
  /** ISO（UTC）开赛时间；解析失败为 null */
  commenceTime: string | null;
  ground: string | null;
}

export interface KnockoutResult {
  id: string;
  team1: string;
  team2: string;
  /** 晋级方 */
  advancer: "team1" | "team2";
  /** 展示比分（加时优先于常规；点球不计入此处比分） */
  score1: number;
  score2: number;
}

/** 队名占位判定：真队名不含数字/斜杠，且不是 W##/RU# 这类引用 */
function isPlaceholder(name: string | undefined): boolean {
  if (!name) return true;
  return /[\d/]/.test(name) || /^(W|RU|L)\d/i.test(name.trim());
}

/**
 * openfootball 的 date+time 转 ISO(UTC)。
 * time 形如 "12:00 UTC-7" / "20:00 UTC-7" / "19:00 UTC-4"。
 */
function toCommenceISO(date?: string, time?: string): string | null {
  if (!date || !time) return null;
  const m = time.match(/^(\d{1,2}):(\d{2})\s*UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, hh, mm, sign, offH, offM = "00"] = m;
  const iso = `${date}T${hh.padStart(2, "0")}:${mm}:00${sign}${offH.padStart(
    2,
    "0",
  )}:${offM.padStart(2, "0")}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function fetchMatches(): Promise<OfMatch[]> {
  const res = await fetch(SOURCE, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`openfootball ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { matches?: OfMatch[] };
  return data.matches ?? [];
}

/** 比赛在整份数据里的序号 → 稳定 id（与 openfootball 的 W## 引用同一套序号） */
function matchId(index: number): string {
  return `wc2026-${index + 1}`;
}

/**
 * 取所有淘汰赛对阵（双方都是真队名的才返回，占位的过滤掉）。
 * 含季军赛（round='third_place'）。
 */
export async function getKnockoutFixtures(): Promise<KnockoutFixture[]> {
  const matches = await fetchMatches();
  const out: KnockoutFixture[] = [];
  matches.forEach((m, i) => {
    const round = m.round ? KNOCKOUT_ROUNDS[m.round] : undefined;
    if (!round) return;
    if (isPlaceholder(m.team1) || isPlaceholder(m.team2)) return;
    out.push({
      id: matchId(i),
      round,
      team1: m.team1!.trim(),
      team2: m.team2!.trim(),
      commenceTime: toCommenceISO(m.date, m.time),
      ground: m.ground ?? null,
    });
  });
  return out;
}

/**
 * 取所有已分出胜负的淘汰赛赛果（含晋级方）。
 * 胜者按 点球 → 加时 → 常规 顺序判定；尚未决出（无决定性比分）的跳过。
 */
export async function getKnockoutResults(): Promise<KnockoutResult[]> {
  const matches = await fetchMatches();
  const out: KnockoutResult[] = [];
  matches.forEach((m, i) => {
    const round = m.round ? KNOCKOUT_ROUNDS[m.round] : undefined;
    if (!round) return;
    if (isPlaceholder(m.team1) || isPlaceholder(m.team2)) return;
    const s = m.score;
    if (!s) return;

    // 决定性比分：点球 → 加时 → 常规
    const decisive = s.p ?? s.et ?? s.ft;
    if (!decisive || decisive[0] === decisive[1]) return; // 未决出
    // 展示比分：加时优先（点球不体现在比分里）
    const shown = s.et ?? s.ft ?? decisive;

    out.push({
      id: matchId(i),
      team1: m.team1!.trim(),
      team2: m.team2!.trim(),
      advancer: decisive[0] > decisive[1] ? "team1" : "team2",
      score1: shown[0],
      score2: shown[1],
    });
  });
  return out;
}
