"use client";

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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 bg-teal-deep/95 backdrop-blur border-b-4 border-[#0f3d3e]">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
        <Link href="/matches" className="font-black text-white text-lg shrink-0">
          🏆 波波杯
        </Link>
        <nav className="flex gap-1.5 ml-1">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 border-[#0f3d3e] ${
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
        <div className="ml-auto flex items-center gap-2">
          {nickname && (
            <span className="text-white/90 text-sm font-semibold hidden sm:inline max-w-[8rem] truncate">
              {nickname}
            </span>
          )}
          <button
            onClick={signOut}
            className="cartoon-btn bg-white text-teal-deep px-3 py-1.5 text-sm"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
