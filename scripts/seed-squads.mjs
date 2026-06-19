// 导入各国家队世界杯大名单到 Supabase 的 players 表 —— 数据完全来自 Transfermarkt。
//
// 流程：
//   1) 世界杯参赛队入口（FIWC）拿到 48 支球队 + 各自的 verein id
//      https://www.transfermarkt.com/weltmeisterschaft/teilnehmer/pokalwettbewerb/FIWC/saison_id/2025
//   2) 每队抓「当前阵容」页（不带 saison_id = 现役征召名单 ≈ 世界杯 26 人），
//      一页拿全：号码 / 名字 / 位置 / 效力俱乐部 / 身价 / 照片 / 是否受伤
//   Transfermarkt 没有官方 API，这里直接抓页面。偶尔重跑即可（赛会期间名单基本不变）。
//
// 运行（Node 20.6+，自动读取 .env.local）：
//   node --env-file=.env.local scripts/seed-squads.mjs            # 全部 48 队
//   node --env-file=.env.local scripts/seed-squads.mjs Germany    # 只跑一队（调试）
//   node --env-file=.env.local scripts/seed-squads.mjs --dry      # 不写库，只打印
//
// 需要环境变量：NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY

import { parse } from "node-html-parser";

const FIWC_SEASON = process.env.FIWC_SEASON ?? "2025";
const PARTICIPANTS_URL = `https://www.transfermarkt.com/weltmeisterschaft/teilnehmer/pokalwettbewerb/FIWC/saison_id/${FIWC_SEASON}`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const DELAY_MS = 1500; // 抓 Transfermarkt 时礼貌限速

// Transfermarkt 位置分组 → GK/DF/MF/FW
const POS_GROUP = { Torwart: "GK", Abwehr: "DF", Mittelfeld: "MF", Sturm: "FW" };

// Transfermarkt 国家队名（FIWC 参赛页写法）→ 我们 teams 表的中文名（src/lib/teamNames.ts）。
const TM_NAME_TO_ZH = {
  France: "法国", England: "英格兰", Spain: "西班牙", Portugal: "葡萄牙",
  Germany: "德国", Brazil: "巴西", Argentina: "阿根廷", Netherlands: "荷兰",
  Norway: "挪威", Belgium: "比利时", "Ivory Coast": "科特迪瓦", Senegal: "塞内加尔",
  Turkiye: "土耳其", Morocco: "摩洛哥", Sweden: "瑞典", Croatia: "克罗地亚",
  "United States": "美国", Ecuador: "厄瓜多尔", Uruguay: "乌拉圭", Switzerland: "瑞士",
  Colombia: "哥伦比亚", Japan: "日本", Algeria: "阿尔及利亚", Austria: "奥地利",
  Ghana: "加纳", Canada: "加拿大", Mexico: "墨西哥", Czechia: "捷克",
  Scotland: "苏格兰", Paraguay: "巴拉圭", "Bosnia-Herzegovina": "波黑",
  "Democratic Republic of the Congo": "刚果(金)", "South Korea": "韩国", Egypt: "埃及",
  Uzbekistan: "乌兹别克斯坦", Australia: "澳大利亚", Tunisia: "突尼斯", Haiti: "海地",
  "Cape Verde": "佛得角", "South Africa": "南非", "Saudi Arabia": "沙特阿拉伯",
  Panama: "巴拿马", "New Zealand": "新西兰", Iran: "伊朗", "Curaçao": "库拉索",
  Iraq: "伊拉克", Jordan: "约旦", Qatar: "卡塔尔",
};

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const onlyTeam = args.find((a) => !a.startsWith("--")) ?? null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normName(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** "€25.00m" / "€900k" / "€1.20bn" / "-" → 欧元整数或 null。 */
function parseMarketValue(text) {
  if (!text) return null;
  const m = text.replace(/\s/g, "").match(/€?([\d.]+)\s*(bn|m|k)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toLowerCase();
  if (unit === "bn") return Math.round(n * 1_000_000_000);
  if (unit === "m") return Math.round(n * 1_000_000);
  if (unit === "k") return Math.round(n * 1_000);
  return Math.round(n);
}

async function fetchText(url, attempt = 1) {
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
  } catch (e) {
    if (attempt <= 4) {
      await sleep(2000 * attempt);
      return fetchText(url, attempt + 1);
    }
    throw e;
  }
  // Transfermarkt 偶发 5xx（限流/抖动）→ 退避重试
  if (res.status >= 500 && attempt <= 4) {
    await sleep(2000 * attempt);
    return fetchText(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// 直接走 PostgREST（service-role），避开 supabase-js 在 Node<22 上的 WebSocket 依赖。
function makeSupaRest() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    async select(path) {
      const res = await fetch(`${base}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`select ${path}: HTTP ${res.status} ${await res.text()}`);
      return res.json();
    },
    async delete(path) {
      const res = await fetch(`${base}/rest/v1/${path}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
      if (!res.ok) throw new Error(`delete ${path}: HTTP ${res.status} ${await res.text()}`);
    },
    async insert(table, rows) {
      const res = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`insert ${table}: HTTP ${res.status} ${await res.text()}`);
    },
  };
}

/** FIWC 参赛页第一个 items 表 → [{id, name}]（48 队）。 */
async function fetchParticipants() {
  const root = parse(await fetchText(PARTICIPANTS_URL));
  const table = root.querySelector("table.items");
  if (!table) throw new Error("参赛页没找到 table.items");
  const out = [];
  const seen = new Set();
  for (const a of table.querySelectorAll('a[href*="/startseite/verein/"]')) {
    const id = a.getAttribute("href")?.match(/verein\/(\d+)/)?.[1];
    const name = a.text.trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name });
  }
  return out;
}

/** 某 verein 的「当前阵容」页 → 球员数组（号码/名字/位置/俱乐部/身价/照片/伤病）。 */
async function fetchSquad(clubId) {
  const root = parse(await fetchText(`https://www.transfermarkt.com/-/kader/verein/${clubId}`));
  const rows = root
    .querySelectorAll("table.items > tbody > tr")
    .filter((tr) => tr.querySelector('td.hauptlink a[href*="/profil/spieler/"]'));
  return rows.map((tr, i) => {
    const tds = tr.querySelectorAll(":scope > td");
    const numRaw = tr.querySelector(".rn_nummer")?.text.trim();
    const nameA = tr.querySelector("td.hauptlink a");
    const pg = (tds[0]?.getAttribute("class") || "").match(/bg_(\w+)/)?.[1];
    const clubA = tr.querySelector('a[href*="/verein/"]');
    const img = tr.querySelector("img.bilderrahmen-fixed, img.bilderrahmen");
    let photo = img?.getAttribute("data-src") || null;
    if (!photo) {
      const s = img?.getAttribute("src");
      photo = s && !s.startsWith("data:") ? s : null;
    }
    const dobM = tr.text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return {
      shirt_number: numRaw && /^\d+$/.test(numRaw) ? Number(numRaw) : null,
      name: nameA?.text.trim() || "",
      position: POS_GROUP[pg] ?? null,
      club: clubA?.getAttribute("title") || clubA?.querySelector("img")?.getAttribute("title") || null,
      market_value: parseMarketValue(tr.querySelector("td.rechts.hauptlink")?.text || ""),
      photo_url: photo,
      injured: !!tr.querySelector(".verletzt-table, [class*='verletzt']"),
      tm_player_id: nameA?.getAttribute("href")?.match(/\/spieler\/(\d+)/)?.[1] ?? null,
      dob: dobM ? `${dobM[3]}-${dobM[2]}-${dobM[1]}` : null,
      sort_order: i,
    };
  }).filter((p) => p.name);
}

async function main() {
  if (!DRY && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，请用 --env-file=.env.local 运行");
    process.exit(1);
  }
  const supabase = DRY ? null : makeSupaRest();
  console.log(`开始导入${DRY ? "（dry-run，不写库）" : ""}`);

  // 库里 teams（按中文名建索引）
  let teamsByZh = new Map();
  if (!DRY) {
    const teams = await supabase.select("teams?select=id,name_zh,name_en");
    for (const t of teams) teamsByZh.set(t.name_zh, t);
  }

  let participants = await fetchParticipants();
  console.log(`FIWC 参赛队: ${participants.length}`);
  if (onlyTeam) participants = participants.filter((p) => normName(p.name) === normName(onlyTeam));

  let totalPlayers = 0;
  const unmatched = [];

  for (const p of participants) {
    const zh = TM_NAME_TO_ZH[p.name];
    if (!zh) {
      unmatched.push(`${p.name}（TM 名未登记到 TM_NAME_TO_ZH）`);
      continue;
    }
    const team = DRY ? { id: null } : teamsByZh.get(zh);
    if (!DRY && !team) {
      unmatched.push(`${p.name} → ${zh}（teams 表里没有，可能还没建队）`);
      continue;
    }

    let squad;
    try {
      await sleep(DELAY_MS);
      squad = await fetchSquad(p.id);
    } catch (e) {
      console.warn(`  ⚠ ${p.name}: 抓阵容失败 — ${e.message}`);
      continue;
    }

    const rows = squad.map((s) => ({ team_id: team.id, club_country: null, injury_note: null, ...s }));
    const withPhoto = rows.filter((r) => r.photo_url).length;
    const withVal = rows.filter((r) => r.market_value != null).length;
    const inj = rows.filter((r) => r.injured).length;
    console.log(`${p.name} (${zh}): ${rows.length} 人 · 照片 ${withPhoto} · 身价 ${withVal} · 伤 ${inj}`);

    if (DRY) {
      for (const r of rows.slice(0, 3)) {
        console.log(`   #${r.shirt_number ?? "-"} ${r.name} | ${r.position} | ${r.club} | ${r.market_value ?? "—"} | ${r.injured ? "🤕" : ""}`);
      }
    } else if (rows.length > 0) {
      try {
        await supabase.delete(`players?team_id=eq.${team.id}`);
        await supabase.insert("players", rows);
      } catch (e) {
        console.warn(`  ⚠ ${p.name}: 写库失败 — ${e.message}`);
        unmatched.push(`${p.name}（写库失败）`);
        continue;
      }
    }
    totalPlayers += rows.length;
  }

  console.log(`\n完成：${totalPlayers} 名球员` + (DRY ? "（未写库）" : " 已写入"));
  if (unmatched.length) console.log(`\n⚠ 未处理：\n  ${unmatched.join("\n  ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
