"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/matches", label: "竞猜", icon: "⚽" },
  { href: "/leaderboard", label: "毒奶榜", icon: "🥛" },
];

export default function Nav({ nickname }: { nickname: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 bg-teal-deep/95 backdrop-blur border-b-4 border-[#0f3d3e]">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-2 sm:gap-3">
        <Link
          href="/matches"
          className="font-black text-white text-lg shrink-0 whitespace-nowrap"
        >
          🥕<span className="hidden sm:inline"> 波波杯</span>
        </Link>
        <nav className="flex gap-1.5 shrink-0">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-2.5 py-1.5 rounded-full text-sm font-bold border-2 border-[#0f3d3e] whitespace-nowrap shrink-0 ${
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

        {/* 右侧：昵称 + 下拉（设置/规则/退出） */}
        <div className="ml-auto relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="cartoon-btn bg-white text-teal-deep px-3 py-1.5 text-sm flex items-center gap-1 max-w-[4.5rem] sm:max-w-[10rem]"
          >
            <span className="truncate">{nickname ?? "我"}</span>
            <span className="text-xs shrink-0">▾</span>
          </button>

          {menuOpen && (
            <>
              {/* 点击空白关闭 */}
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
                  📋 我的投注
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
