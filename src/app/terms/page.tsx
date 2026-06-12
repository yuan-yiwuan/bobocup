import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使用条款 · 波波杯",
};

const UPDATED = "2026年6月12日";
const CONTACT = "bobocup@bobo.ninja";

export default function TermsPage() {
  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-8 text-teal-deep">
      <h1 className="text-2xl font-black mb-1">使用条款</h1>
      <p className="text-sm text-teal-deep/50 mb-6">最后更新：{UPDATED}</p>

      <div className="flex flex-col gap-5 text-sm leading-relaxed">
        <Section title="关于本服务">
          <p>
            波波杯（Bobocup）是一个免费、供朋友间娱乐的 2026
            世界杯比分竞猜小游戏。使用本服务即表示你同意以下条款。
          </p>
        </Section>

        <Section title="虚拟积分，无真实价值">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              游戏中的「胡萝卜」是<b>纯虚拟积分</b>，仅用于游戏内计分与排行。
            </li>
            <li>
              胡萝卜<b>不能用真实货币购买，不能兑换成现金、实物或任何有价物</b>。
            </li>
            <li>
              本服务<b>不涉及任何真实货币投注</b>，不是博彩或赌博服务。
            </li>
          </ul>
        </Section>

        <Section title="账号与行为">
          <p>
            请妥善保管你的登录邮箱。请勿滥用本服务、干扰其他玩家或试图破坏系统。我们可在必要时暂停或删除违规账号。
          </p>
        </Section>

        <Section title="比赛数据与结算">
          <p>
            比赛结果与赔率来自第三方数据源，可能存在延迟或误差；结算以系统记录为准，仅供娱乐，不作任何其他用途。
          </p>
        </Section>

        <Section title="免责声明">
          <p>
            本服务按「现状」提供，不作任何明示或默示的保证。在法律允许的范围内，对因使用本服务产生的任何损失，我们不承担责任。
          </p>
        </Section>

        <Section title="联系我们">
          <p>
            有任何问题，请联系：
            <a className="underline font-semibold" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
          </p>
        </Section>
      </div>

      <div className="mt-8 flex gap-4 text-sm font-semibold">
        <Link href="/privacy" className="underline">
          隐私政策
        </Link>
        <Link href="/login" className="underline">
          返回登录
        </Link>
      </div>
    </main>
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
    <section>
      <h2 className="font-black text-base mb-1">{title}</h2>
      {children}
    </section>
  );
}
