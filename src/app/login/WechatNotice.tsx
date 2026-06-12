"use client";

import { useMounted } from "@/lib/useMounted";

/**
 * 微信/QQ 内置浏览器里 Google 登录用不了（Google 封禁 WebView OAuth）。
 * 邮箱验证码登录不受影响，所以这里只做一个非阻断的提示条，
 * 引导用户优先用邮箱登录，或点右上角在外部浏览器打开再用 Google。
 */
export default function WechatNotice() {
  const mounted = useMounted();
  if (!mounted) return null;

  const ua = navigator.userAgent.toLowerCase();
  const inApp = /micromessenger/.test(ua) || /\bqq\//.test(ua);
  if (!inApp) return null;

  return (
    <div className="w-full max-w-xs cartoon-card bg-cream px-4 py-3 text-sm text-teal-deep font-semibold leading-relaxed">
      <p>📵 微信里无法用 Google 登录，请用下方<b>邮箱验证码</b>登录。</p>
      <p className="text-xs text-teal-deep/60 mt-1">
        想用 Google？点右上角 ··· →「在浏览器打开」。
      </p>
    </div>
  );
}
