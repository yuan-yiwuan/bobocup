import type { createAdminClient } from "@/lib/supabase/admin";
import { activeUserIds } from "@/lib/leaderboard";

/**
 * 「胡萝卜王」盘：选项 = 当前在收成榜上的玩家，赔率按当前净胡萝卜每小时更新。
 * 选项不来自 Polymarket；用蔬菜🥬下注（不计入收成榜）；结算为手动（世界杯结束后）。
 */
export const CARROT_KING = {
  id: "bobocup-carrot-king",
  title: "胡萝卜王 · 谁最后收成最多",
  kind: "carrot_king",
  outcome_label: "选手",
} as const;

/**
 * 净胡萝卜 → 夺魁概率（softmax）。
 *  - 温度随分差自适应：早期大家都接近 0 时接近均匀分布；分差拉开后才拉开赔率。
 *  - 下限 300 防止过尖；单人概率封顶 0.9，避免退化成 1.00。
 */
export function carrotSoftmax(nets: number[]): number[] {
  const n = nets.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const mean = nets.reduce((s, x) => s + x, 0) / n;
  const std = Math.sqrt(nets.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  const T = Math.max(300, std);
  const mx = Math.max(...nets);
  const weights = nets.map((x) => Math.exp((x - mx) / T));
  const sum = weights.reduce((s, w) => s + w, 0);
  let probs = weights.map((w) => w / sum);
  // 安全封顶：任一选项不超过 0.9，超出部分按比例分给其余选项
  const CAP = 0.9;
  const over = probs.findIndex((p) => p > CAP);
  if (over >= 0) {
    const others = probs.reduce((s, p, i) => (i === over ? s : s + p), 0) || 1;
    probs = probs.map((p, i) => (i === over ? CAP : (1 - CAP) * (p / others)));
  }
  return probs;
}

/**
 * 刷新「胡萝卜王」盘：
 *  - upsert 盘元数据；已结算则跳过（不再改赔率）。
 *  - 选项 = 当前在收成榜上的玩家（activeUserIds：近 3 天有投注/结算，或已开赛比赛覆盖 >50%）。
 *  - 赔率 = softmax(净胡萝卜) 的公平赔率。
 *  - 已掉出榜单、且没人押过的旧选项会被清掉（有人押过的保留并置灰，保证结算完整）。
 */
export async function refreshCarrotKing(
  supabase: ReturnType<typeof createAdminClient>,
) {
  const nowIso = new Date().toISOString();

  await supabase.from("outright_markets").upsert(
    {
      id: CARROT_KING.id,
      title: CARROT_KING.title,
      kind: CARROT_KING.kind,
      outcome_label: CARROT_KING.outcome_label,
      updated_at: nowIso,
    },
    { onConflict: "id" },
  );

  const { data: mkt } = await supabase
    .from("outright_markets")
    .select("settled")
    .eq("id", CARROT_KING.id)
    .maybeSingle();
  if (mkt?.settled) return "already settled";

  // 收成榜聚合 + 活跃判定所需的比赛注单/赛程
  const [{ data: lb }, { data: bets }, { data: matches }] = await Promise.all([
    supabase
      .from("leaderboard")
      .select("id, nickname, total_staked, total_returned"),
    supabase
      .from("bets")
      .select("user_id, match_id, status, created_at, updated_at"),
    supabase.from("matches").select("id, commence_time"),
  ]);

  // 与收成榜完全一致：只保留「现在在排行榜上」的玩家
  const active = activeUserIds(bets ?? [], matches ?? []);
  const players = (lb ?? []).filter((r) => active.has(r.id as string));
  const keepNames = new Set(players.map((r) => r.id as string));

  const nets = players.map(
    (r) => Number(r.total_returned ?? 0) - Number(r.total_staked ?? 0),
  );
  const probs = carrotSoftmax(nets);

  // 概率从高到低定 sort_order
  const order = players.map((_, i) => i).sort((a, b) => probs[b] - probs[a]);
  const rows = order.map((pi, i) => {
    const p = probs[pi];
    return {
      market_id: CARROT_KING.id,
      name: players[pi].id as string, // user_id
      name_zh: (players[pi].nickname as string) ?? "神秘人",
      team_id: null,
      prob: p,
      odds: p > 0 ? Math.round((1 / p) * 100) / 100 : null,
      image_url: null,
      sort_order: i,
      closed: false,
      updated_at: nowIso,
    };
  });
  if (rows.length > 0) {
    const { error } = await supabase
      .from("outright_outcomes")
      .upsert(rows, { onConflict: "market_id,name" });
    if (error) throw new Error(`carrot_king outcomes: ${error.message}`);
  }

  // 清理已掉出榜单的旧选项：没人押过的直接删，有人押过的置灰保留
  const [{ data: existing }, { data: placed }] = await Promise.all([
    supabase
      .from("outright_outcomes")
      .select("id, name")
      .eq("market_id", CARROT_KING.id),
    supabase
      .from("outright_bets")
      .select("outcome_id")
      .eq("market_id", CARROT_KING.id),
  ]);
  const betOutcomeIds = new Set(
    (placed ?? []).map((b) => b.outcome_id as number),
  );
  const staleDelete: number[] = [];
  const staleClose: number[] = [];
  for (const o of existing ?? []) {
    if (keepNames.has(o.name as string)) continue;
    if (betOutcomeIds.has(o.id as number)) staleClose.push(o.id as number);
    else staleDelete.push(o.id as number);
  }
  if (staleDelete.length > 0) {
    await supabase.from("outright_outcomes").delete().in("id", staleDelete);
  }
  if (staleClose.length > 0) {
    await supabase
      .from("outright_outcomes")
      .update({ closed: true, updated_at: nowIso })
      .in("id", staleClose);
  }

  return {
    outcomes: rows.length,
    removed: staleDelete.length,
    closed: staleClose.length,
  };
}
