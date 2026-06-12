import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 读取结算 cron 的「上次运行时间」心跳（app_meta.last_settle_run）。
 * 返回 ISO 字符串；从未运行过或表不存在时返回 null。
 */
export async function getLastSettleRun(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", "last_settle_run")
    .maybeSingle();
  return data?.value ?? null;
}
