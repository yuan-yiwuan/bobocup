/**
 * 抓世界杯相关的 Polymarket 盘，灌入每日竞猜池（outright_markets, kind='daily', pool=true）。
 * 排除：比赛结果/小组排名、Club World Cup、电竞、已结束、现有金靴/夺冠/reach-stage、
 *       以及 per-match「announcers say during X vs Y」（太短命）。
 * 用法：
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-daily-pool.mjs
 * 可重复运行（按 id=slug upsert，不动 featured_date/settled）。
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const parseArr = (v) => {
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
};

const Q = [
  "world cup", "world cup trump", "world cup messi", "world cup ronaldo",
  "world cup mbappe", "world cup neymar", "world cup haaland", "world cup top scorer",
  "world cup golden ball", "world cup young player", "world cup player",
  "world cup most goals", "world cup most assists", "world cup goal contributions",
  "world cup h2h", "world cup record", "world cup goalkeeper", "world cup unbeaten",
  "world cup concede", "world cup eliminated", "world cup furthest", "world cup halftime",
  "world cup cry", "world cup continent", "world cup penalty", "world cup clean sheet",
  "world cup free kick", "world cup stage of elimination",
];

const EXCLUDE_SLUG = new Set([
  "world-cup-golden-boot-winner",
  "world-cup-winner",
  "world-cup-nation-to-reach-round-of-16",
  "world-cup-nation-to-reach-quarterfinals",
  "world-cup-nation-to-reach-semifinals",
  "world-cup-nation-to-reach-final",
]);

const isRealWC = (e) => {
  const t = (e.title || "") + " " + (e.slug || "");
  if (!/world cup|fifa world/i.test(t)) return false;
  if (/club world cup|fifa-club/i.test(t)) return false;
  if (/esports|lol:|league of legends|cs2|dota/i.test(t)) return false;
  return true;
};

const isExcluded = (e) => {
  const t = e.title || "";
  if (/group [a-l] (winner|second place|last place)/i.test(t)) return true;
  if (/who will win|to win the match|match winner/i.test(t)) return true;
  // per-match announcer：太短命，去掉
  if (/announcers? say during .* vs /i.test(t)) return true;
  // 单场 "X vs Y"（非 h2h、非 announcer）
  if (/ vs\.? /i.test(t) && !/h2h|goals h2h/i.test(t)) return true;
  return false;
};

const category = (t) => {
  if (/trump/i.test(t)) return "trump";
  if (/announcer|halftime|cry|wear|sing|anthem|perform|mascot|kiss|propose|haircut|streak/i.test(t)) return "culture";
  if (/h2h|vs\.? .*(goals|assists)/i.test(t)) return "player_h2h";
  if (/golden ball|young player|most assists|most goal|player to score|goalkeeper to score|record broken|missed penalt|penalty shootout|(messi|ronaldo|neymar|mbappe|haaland|kane).*goals/i.test(t)) return "player_futures";
  if (/continent|top scorer \(nation\)|furthest advancing|highest-ranking nation|unbeaten|concede the most|third-place|teams to advance/i.test(t)) return "tournament_futures";
  if (/team to|clean sheet|to score|free kick|cards|corners/i.test(t)) return "team_props";
  if (/eliminat|reach|advance|stage/i.test(t)) return "stage_elim";
  return "other";
};

async function main() {
  const byId = new Map();
  for (const q of Q) {
    try {
      const r = await fetch(
        "https://gamma-api.polymarket.com/public-search?q=" +
          encodeURIComponent(q) + "&limit_per_type=50",
      );
      const d = await r.json();
      for (const e of d.events || []) byId.set(e.id, e);
    } catch {
      /* ignore */
    }
  }

  const rows = [];
  for (const e of byId.values()) {
    if (!isRealWC(e) || e.closed || EXCLUDE_SLUG.has(e.slug) || isExcluded(e)) continue;
    let n = 0;
    for (const m of e.markets || []) {
      if (m.closed) continue;
      const o = parseArr(m.outcomes);
      const p = parseArr(m.outcomePrices);
      const yi = o.findIndex((x) => x.toLowerCase() === "yes");
      const y = Number(p[yi >= 0 ? yi : 0]);
      if (Number.isFinite(y)) n++;
    }
    if (n === 0) continue;
    rows.push({
      id: e.slug,
      title: e.title,
      kind: "daily",
      outcome_label: "选项",
      pool: true,
      category: category(e.title || ""),
      volume: Math.round(e.volume || 0),
    });
  }

  console.log(`候选 ${rows.length} 个，写入 outright_markets…`);
  const res = await fetch(`${URL}/rest/v1/outright_markets?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.error("写入失败:", res.status, await res.text());
    process.exit(1);
  }
  const byCat = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;
  console.log("完成。分类分布:", JSON.stringify(byCat));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
