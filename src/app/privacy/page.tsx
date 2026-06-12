import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策 · 波波杯",
};

const UPDATED = "2026年6月12日";
const CONTACT = "bobocup@bobo.ninja";

export default function PrivacyPage() {
  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-8 text-teal-deep">
      <h1 className="text-2xl font-black mb-1">隐私政策</h1>
      <p className="text-sm text-teal-deep/50 mb-6">最后更新：{UPDATED}</p>

      <div className="flex flex-col gap-5 text-sm leading-relaxed">
        <Section title="这是什么">
          <p>
            波波杯（Bobocup）是一个朋友之间的 2026
            世界杯比分竞猜小游戏，用虚拟「胡萝卜」积分对比赛结果进行预测，纯娱乐、非商业。本政策说明我们收集哪些信息、如何使用。
          </p>
        </Section>

        <Section title="我们收集的信息">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <b>账号信息</b>：你登录时使用的邮箱地址（通过邮箱验证码或 Google
              登录获取）。
            </li>
            <li>
              <b>资料</b>：你设置的昵称、（可选）主队。
            </li>
            <li>
              <b>游戏数据</b>：你的竞猜记录、结算结果、积分。
            </li>
          </ul>
          <p className="mt-1">
            我们不收集你的真实姓名、电话、住址、支付信息，也不进行任何真实货币交易。
          </p>
        </Section>

        <Section title="如何使用这些信息">
          <p>
            仅用于运行游戏本身：登录验证、展示排行榜与战绩、赛后结算。不会用于广告，也不会出售或出租给第三方做营销。
          </p>
        </Section>

        <Section title="第三方服务">
          <p>为提供服务，我们使用以下第三方，它们各自的隐私政策适用：</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>
              <b>Supabase</b>：数据库与登录认证（存储上述账号与游戏数据）。
            </li>
            <li>
              <b>Google</b>：可选的 Google 登录（仅获取邮箱、基础资料）。
            </li>
            <li>
              <b>Resend</b>：发送登录验证码邮件。
            </li>
            <li>
              <b>Vercel</b>：网站托管。
            </li>
            <li>
              <b>the-odds-api</b>：获取比赛与赔率数据（不向其发送你的个人信息）。
            </li>
          </ul>
        </Section>

        <Section title="数据保存与删除">
          <p>
            数据保存在 Supabase，直到你要求删除。你可以随时通过下方邮箱联系我们，删除你的账号及相关数据。
          </p>
        </Section>

        <Section title="联系我们">
          <p>
            有任何隐私相关问题，请联系：
            <a className="underline font-semibold" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
          </p>
        </Section>
      </div>

      <div className="mt-8 flex gap-4 text-sm font-semibold">
        <Link href="/terms" className="underline">
          使用条款
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
