"use client";

import { useMounted } from "@/lib/useMounted";

/**
 * 微信/QQ 等内置浏览器无法完成 Google 登录（Google 封禁 WebView OAuth）。
 * 检测到时弹出遮罩，引导用户用外部浏览器打开。
 */
export default function WechatNotice() {
  const mounted = useMounted();
  if (!mounted) return null;

  const ua = navigator.userAgent.toLowerCase();
  const inApp = /micromessenger/.test(ua) || /\bqq\//.test(ua);
  if (!inApp) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 text-white flex flex-col items-end p-5">
      <div className="text-right">
        <div className="text-5xl mb-2">☝️</div>
        <p className="font-black text-lg">请点击右上角 ··· </p>
        <p className="font-bold">选择「在浏览器打开」</p>
      </div>
      <div className="mt-10 self-center max-w-xs text-center text-sm leading-relaxed bg-white/10 rounded-2xl p-4">
        <p className="mb-1">微信内置浏览器无法使用 Google 登录。</p>
        <p>请用 Safari / Chrome 等浏览器打开本页面后再登录。</p>
        <p className="mt-2 text-white/60 text-xs">
          （中国大陆用户使用 Google 登录可能仍需科学上网）
        </p>
      </div>
    </div>
  );
}
