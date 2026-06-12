import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginButton from "./LoginButton";
import EmailLogin from "./EmailLogin";
import WechatNotice from "./WechatNotice";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/matches");

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="text-6xl">🥕🥛⚽</div>
      <h1 className="text-3xl font-black text-teal-deep leading-snug">
        第0届
        <br />
        波波杯毒奶王中王争霸赛
      </h1>
      <p className="text-teal-deep/70 font-semibold max-w-sm">
        2026 世界杯竞猜 · 争夺本届毒奶王！
      </p>

      <WechatNotice />
      <LoginButton />

      <div className="flex items-center gap-3 w-full max-w-xs text-teal-deep/40 text-xs font-bold">
        <div className="flex-1 h-px bg-teal-deep/20" />
        或
        <div className="flex-1 h-px bg-teal-deep/20" />
      </div>

      <EmailLogin />
    </main>
  );
}
