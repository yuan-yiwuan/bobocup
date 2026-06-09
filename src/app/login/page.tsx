import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginButton from "./LoginButton";
import WechatNotice from "./WechatNotice";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/matches");

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-6">
      <WechatNotice />
      <div className="text-6xl">🥕🥛⚽</div>
      <h1 className="text-3xl font-black text-teal-deep leading-snug">
        第0届
        <br />
        波波杯毒奶王中王争霸赛
      </h1>
      <p className="text-teal-deep/70 font-semibold max-w-sm">
        2026 世界杯竞猜 · 争夺本届毒奶王！
      </p>
      <LoginButton />
    </main>
  );
}
