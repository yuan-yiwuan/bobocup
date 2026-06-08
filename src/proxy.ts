import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 匹配除以下之外的所有路径：
     * - api（API / cron 路由，自己做鉴权）
     * - _next/static、_next/image（静态资源）
     * - favicon.ico 及常见图片/资源后缀
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
