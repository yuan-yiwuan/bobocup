"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 邮箱验证码（6 位 OTP）登录：输邮箱 → 收码 → 输码登录。
 * 全程同一浏览器，无 redirect，微信内置浏览器也能用。
 * 新邮箱自动注册（shouldCreateUser），之后走 onboarding 设昵称。
 */
export default function EmailLogin() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setLoading(false);
      setErr("验证码错误或已过期");
      return;
    }
    // 整页跳转，让服务端读到刚写入的 session cookie
    window.location.href = "/matches";
  }

  const inputCls =
    "w-full cartoon-card px-4 py-3 text-base text-teal-deep font-semibold focus:outline-none";

  if (step === "code") {
    return (
      <form onSubmit={verify} className="w-full max-w-xs flex flex-col gap-3">
        <p className="text-sm text-teal-deep/70 font-semibold">
          验证码已发到 <b>{email}</b>，填进来 👇
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6 位验证码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${inputCls} text-center tracking-[0.4em]`}
          required
        />
        {err && <p className="text-xs text-red-600 font-semibold">{err}</p>}
        <button
          type="submit"
          disabled={loading}
          className="cartoon-btn bg-teal-brand text-white px-6 py-3 text-base font-black"
        >
          {loading ? "验证中…" : "登录"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setErr(null);
          }}
          className="text-xs text-teal-deep/60 font-semibold underline"
        >
          换个邮箱 / 重新发送
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="w-full max-w-xs flex flex-col gap-3">
      <input
        type="email"
        autoComplete="email"
        placeholder="你的邮箱"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={inputCls}
        required
      />
      {err && <p className="text-xs text-red-600 font-semibold">{err}</p>}
      <button
        type="submit"
        disabled={loading}
        className="cartoon-btn bg-teal-brand text-white px-6 py-3 text-base font-black"
      >
        {loading ? "发送中…" : "发送验证码"}
      </button>
    </form>
  );
}
