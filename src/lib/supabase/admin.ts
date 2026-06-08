import { createClient } from "@supabase/supabase-js";

/**
 * 服务端管理客户端，使用 service-role key 绕过 RLS。
 * 仅可在受保护的服务端代码中使用（cron 路由、结算逻辑），切勿在前端引入。
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
