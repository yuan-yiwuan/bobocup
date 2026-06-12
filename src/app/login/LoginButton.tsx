"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginButton({ disabled = false }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) {
      setLoading(false);
      alert("登录失败：" + error.message);
    }
  }

  return (
    <button
      onClick={signIn}
      disabled={loading || disabled}
      className={`cartoon-btn px-6 py-3 text-base flex items-center gap-2 ${
        disabled
          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
          : "bg-white text-teal-deep"
      }`}
    >
      <span className="text-xl">🇬</span>
      {loading ? "跳转中…" : "使用 Google 登录"}
    </button>
  );
}
