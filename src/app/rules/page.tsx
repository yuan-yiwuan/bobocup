import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.nickname) redirect("/onboarding");

  return (
    <>
      <Nav nickname={profile.nickname} />
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-black text-teal-deep mb-4">📖 游戏规则</h1>

        <div className="flex flex-col gap-4">
          <Section title="🥕 怎么玩">
            <p>这是 2026 世界杯竞猜。每场比赛你可以三选一：</p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li>
                <b>主胜 / 平局 / 客胜</b>，每场默认投 <b>100 根胡萝卜 🥕</b>
              </li>
              <li>开赛前可以随便改、也可以取消</li>
              <li>只能竞猜还没开赛的比赛；开赛后这场就锁定了</li>
            </ul>
          </Section>

          <Section title="💰 倍数与结算">
            <ul className="list-disc pl-5 space-y-0.5">
              <li>倍数来自真实数据，每天更新一次</li>
              <li>
                <b>竞猜时的倍数会被锁定</b>，结算以你竞猜那一刻的倍数为准
              </li>
              <li>
                每天比赛结束后自动结算：猜中得 <b>投入 × 倍数</b> 根胡萝卜，猜错归零
              </li>
            </ul>
          </Section>

          <Section title="⭐ 主队加成">
            <ul className="list-disc pl-5 space-y-0.5">
              <li>在设置里选一个主队</li>
              <li>
                当你竞猜 <b>自己主队所在的那场、且猜主队赢</b> 时，可以投{" "}
                <b>1~3 倍</b>（最多 300 根胡萝卜）
              </li>
              <li>猜平局、猜对手、或非主队比赛，一律 100 根</li>
            </ul>
          </Section>

          <Section title="🥛 毒奶榜">
            <p>
              按<b>猜错率</b>排，<b>越高越毒</b>。毒奶指数就是你已结算比赛里猜错的比例：
            </p>
            <div className="cartoon-btn bg-cream px-3 py-2 my-2 text-sm font-mono">
              毒奶指数 = 猜错场次 ÷ 已结算场次
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>5 场猜错 3 场 → <b>60%</b></li>
              <li>第一名就是<b>当前毒奶王</b> 👑</li>
              <li>
                顶部显示 <b>🎯 昨日最准</b> / <b>🥛 昨日最毒</b>（按昨天的命中率）
              </li>
            </ul>
          </Section>

          <Section title="🥕 收成榜">
            <p>
              按<b>净赚的胡萝卜</b>排，<b>胡萝卜越多排越前</b>。就是你收到的胡萝卜减去投入的：
            </p>
            <div className="cartoon-btn bg-cream px-3 py-2 my-2 text-sm font-mono">
              胡萝卜 = 回报总额 − 已结算投入总额
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>投 100 赢回 200 → <b>+100</b>；投 100 全输 → <b>−100</b></li>
              <li>第一名就是<b>胡萝卜最多</b> 👑</li>
              <li>
                顶部显示 <b>💰 昨日最赚</b> / <b>💸 昨日最赔</b>（按昨天赚的胡萝卜）
              </li>
            </ul>
            <p className="mt-2 text-xs text-teal-deep/60">
              昨日榜只看昨天开赛、已结算的比赛；多人并列时轮流展示。
            </p>
          </Section>
        </div>

        <Link
          href="/matches"
          className="cartoon-btn bg-yellow-300 text-teal-deep px-4 py-3 mt-6 block text-center font-black text-base"
        >
          开始竞猜 🚀
        </Link>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cartoon-card p-4 text-teal-deep text-sm leading-relaxed">
      <h2 className="font-black text-base mb-1.5">{title}</h2>
      {children}
    </section>
  );
}
