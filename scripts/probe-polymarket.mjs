/**
 * 探针：扫一遍 Polymarket（Gamma API，公开免认证）上的 2026 世界杯相关盘，
 * 打印每个 event 的 slug、市场结构、当前价格（=隐含概率）。
 * 用法：node scripts/probe-polymarket.mjs [关键词]
 * 例：  node scripts/probe-polymarket.mjs "golden boot"
 */

const GAMMA = "https://gamma-api.polymarket.com";

// 想看的盘：晋级类、奖项类、夺冠
const QUERIES = process.argv[2]
  ? [process.argv[2]]
  : ["world cup golden boot", "world cup winner", "world cup nation to reach", "world cup top scorer"];

/** outcomes / outcomePrices 在 Gamma 里是 JSON 字符串，做个安全解析 */
function parseMaybeJson(v) {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

async function search(q) {
  const url = `${GAMMA}/public-search?q=${encodeURIComponent(q)}&limit_per_type=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`search "${q}" -> ${res.status}`);
  const data = await res.json();
  return data.events ?? [];
}

function fmtPct(p) {
  const n = Number(p);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : String(p);
}

function summarizeEvent(ev) {
  console.log("\n" + "═".repeat(70));
  console.log(`📌 ${ev.title}`);
  console.log(`   slug:   ${ev.slug}`);
  console.log(`   active: ${ev.active}  closed: ${ev.closed}  negRisk: ${ev.negRisk}`);
  console.log(`   liquidity: $${Math.round(ev.liquidity ?? 0).toLocaleString()}  volume: $${Math.round(ev.volume ?? 0).toLocaleString()}`);
  console.log(`   endDate: ${ev.endDate}`);
  const markets = ev.markets ?? [];
  console.log(`   markets: ${markets.length}`);

  // 取价格最高的前 12 个，看看候选项 + 隐含概率
  const rows = markets
    .map((m) => {
      const outcomes = parseMaybeJson(m.outcomes) ?? [];
      const prices = parseMaybeJson(m.outcomePrices) ?? [];
      // 二元市场：通常 outcomes=["Yes","No"]，取 Yes 价
      const yesIdx = Array.isArray(outcomes)
        ? outcomes.findIndex((o) => String(o).toLowerCase() === "yes")
        : -1;
      const yes = yesIdx >= 0 ? prices[yesIdx] : prices[0];
      return {
        q: m.groupItemTitle || m.question || m.slug,
        yes: Number(yes),
        slug: m.slug,
        conditionId: m.conditionId,
      };
    })
    .filter((r) => Number.isFinite(r.yes))
    .sort((a, b) => b.yes - a.yes)
    .slice(0, 12);

  for (const r of rows) {
    console.log(`     - ${fmtPct(r.yes).padStart(6)}  ${r.q}`);
  }
  // 打印一个样本市场的全字段，方便看接口形状
  if (markets[0]) {
    console.log("\n   ── sample market raw keys ──");
    console.log("   " + Object.keys(markets[0]).join(", "));
  }
}

async function main() {
  const seen = new Set();
  for (const q of QUERIES) {
    let events;
    try {
      events = await search(q);
    } catch (e) {
      console.error(`✗ ${e.message}`);
      continue;
    }
    console.log(`\n### query="${q}" -> ${events.length} events`);
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      if (!/world cup|fifa/i.test(ev.title)) continue;
      summarizeEvent(ev);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
