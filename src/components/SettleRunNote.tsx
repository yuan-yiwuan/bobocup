"use client";

import { useMounted } from "@/lib/useMounted";
import { settleRunLabel } from "@/lib/format";

/**
 * 「上次结算检查」时间。在客户端渲染，让 Intl 用浏览器本地时区，
 * 而非服务端（Vercel UTC）时区。mounted 门控避免 hydration 不一致。
 */
export default function SettleRunNote({ iso }: { iso: string }) {
  const mounted = useMounted();
  return (
    <p className="text-xs text-teal-deep/40 font-semibold mb-4">
      🔄 上次结算检查：{mounted ? settleRunLabel(iso) : "…"}
    </p>
  );
}
