import { type NextRequest } from "next/server";

/**
 * 校验 cron 请求。Vercel Cron 会带 `Authorization: Bearer <CRON_SECRET>`。
 * 手动触发时也带同样的 header 即可。
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
