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
            <p>这是 2026 世界杯竞猜。</p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li>
                <b>小组赛</b>：猜 主胜 / 平局 / 客胜，每场 <b>100 根胡萝卜 🥕</b>
              </li>
              <li>
                <b>淘汰赛</b>：猜 <b>谁晋级</b>（两选一），每场 <b>200 根 🥕</b>
              </li>
              <li>开赛前可以随便改、也可以取消；开赛后这场就锁定了</li>
            </ul>
          </Section>

          <Section title="🏆 特别竞猜">
            <ul className="list-disc pl-5 space-y-0.5">
              <li>
                和单场无关的长期盘：<b>金靴</b>、<b>夺冠球队</b>
              </li>
              <li>
                每个一注 <b>200 根 🥕</b>，<b>一旦竞猜不可修改或撤销</b>
              </li>
              <li>一直开放到揭晓；倍数每天更新，竞猜那刻锁定</li>
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
                只要是 <b>自己主队的比赛</b>，任选都可投 <b>1~3 倍</b>
                （小组赛 100~300、淘汰赛 200~600 根胡萝卜，最多 600）
              </li>
              <li>非主队的比赛，按该场基础注额（小组赛 100、淘汰赛 200）</li>
              <li>主队一旦选定不能更换；<b>被淘汰后可改选</b>一支仍在比赛的球队</li>
            </ul>
          </Section>

          <Section title="👀 谁会上榜">
            <p>排行榜只展示<b>近期活跃</b>的玩家，满足任一条件即可上榜：</p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li>近 <b>3 天</b>内竞猜过</li>
              <li>近 <b>3 天</b>内有竞猜结算</li>
              <li>已开赛的比赛里，你的竞猜覆盖<b>超过一半</b></li>
            </ul>
            <p className="mt-2 text-xs text-teal-deep/60">
              冷场太久会暂时从榜上隐藏，回来竞猜马上就回来啦。
            </p>
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
              <li>第一名就是<b>毒奶王</b> 👑</li>
              <li>
                顶部显示 <b>🎯 昨日最准</b> / <b>🥛 昨日最毒</b>（按昨天的猜对率）
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
