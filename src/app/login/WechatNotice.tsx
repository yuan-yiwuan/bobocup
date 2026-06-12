/**
 * 微信/QQ 内置浏览器里 Google 登录用不了（Google 封禁 WebView OAuth）的提示条。
 * 是否在微信里由服务端（登录页读 User-Agent）判断，这里只负责展示。
 * 放在已灰显的 Google 按钮下方。
 */
export default function WechatNotice() {
  return (
    <div className="w-full max-w-xs cartoon-card bg-cream px-4 py-3 text-sm text-teal-deep font-semibold leading-relaxed">
      <p>📵 微信里无法用 Google 登录，请用上方<b>邮箱验证码</b>登录。</p>
      <p className="text-xs text-teal-deep/60 mt-1">
        想用 Google？点右上角 ··· →「在浏览器打开」。
      </p>
    </div>
  );
}
