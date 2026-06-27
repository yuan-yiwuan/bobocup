"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/matches", label: "比赛", icon: "⚽" },
  { href: "/matches?tab=special", label: "特别竞猜", icon: "✨" },
  { href: "/leaderboard", label: "排行榜", icon: "🏆" },
];

export default function Nav({ nickname }: { nickname: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const onSpecial =
    pathname === "/matches" && searchParams.get("tab") === "special";
  function isActive(href: string): boolean {
    if (href === "/matches?tab=special") return onSpecial;
    if (href === "/matches") return pathname === "/matches" && !onSpecial;
    return pathname.startsWith(href);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = nickname?.trim()?.[0] ?? "🥕";

  return (
    <header className="sticky top-0 z-20 bg-teal-deep/95 backdrop-blur border-b-4 border-[#0f3d3e]">
      <div className="mx-auto max-w-3xl px-3 py-3 flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/matches"
          className="font-black text-white text-xl shrink-0"
          aria-label="波波杯"
        >
          🥕
        </Link>
        <nav className="flex gap-1 shrink min-w-0 overflow-x-auto">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2 py-1.5 rounded-full text-sm font-bold border-2 border-[#0f3d3e] whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-yellow-300 text-[#0f3d3e]"
                    : "bg-white/90 text-teal-deep"
                }`}
              >
                {l.icon} {l.label}
              </Link>
            );
          })}
        </nav>

        {/* 右侧：头像下拉（我的竞猜/大名单/设置/规则/退出） */}
        <div className="ml-auto relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="cartoon-btn bg-white text-teal-deep px-2.5 py-1.5 text-sm flex items-center gap-1 min-w-0"
            aria-label="菜单"
          >
            {/* 默认显示全名；空间实在不够（极窄屏）才压成首字母 */}
            <span className="hidden min-[360px]:inline truncate max-w-[4.5rem] sm:max-w-[10rem]">
              {nickname ?? "我"}
            </span>
            <span className="min-[360px]:hidden font-black uppercase">
              {initial}
            </span>
            <span className="text-xs shrink-0">▾</span>
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-36 z-20 cartoon-card p-1.5 flex flex-col">
                <Link
                  href="/my-bets"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-teal-deep hover:bg-teal-50 text-left"
                >
                  📋 我的竞猜
                </Link>
                <Link
                  href="/squad"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-teal-deep hover:bg-teal-50 text-left"
                >
                  👥 大名单
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-teal-deep hover:bg-teal-50 text-left"
                >
                  ⚙️ 设置
                </Link>
                <Link
                  href="/rules"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-teal-deep hover:bg-teal-50 text-left"
                >
                  📖 规则
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 text-left"
                >
                  🚪 退出
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
