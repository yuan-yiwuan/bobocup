# 🏆 第0届波波杯毒奶王中王争霸赛

2026 世界杯竞猜小游戏。每场比赛押 100 根 🥕 胡萝卜，**猜得越烂、毒奶指数越高**，排行榜争夺本届「毒奶王」。朋友间玩的非盈利项目。

产品需求见 [`P.md`](./P.md)。

## 技术栈

- **Next.js 16**（App Router, TypeScript）+ Tailwind v4，部署在 Vercel
- **Supabase**：Google 登录 + Postgres
- **the-odds-api.com**：赛程 / 赔率 / 比分（sport key `soccer_fifa_world_cup`）
- **Vercel Cron**：每日刷新赔率 + 每日结算

> 注意：Next.js 16 把 `middleware` 重命名为 `proxy`，本项目 session 刷新在 `src/proxy.ts`。

## 毒奶指数

对**已结算**注单聚合：

```
毒奶指数 = (已结算下注总额 − 已结算回报总额) / 已结算下注总额 × 100%
```

押 100 全输 = +100%（满级毒奶）；回本 = 0%；翻倍 = −100%（神预测）。

## 本地开发

1. 安装依赖：`npm install`
2. 复制环境变量：`cp .env.example .env.local`，填入真实值
3. 在 Supabase SQL Editor 依次运行：
   - `supabase/migrations/0001_init.sql`（建表 / RLS / 触发器 / 排行榜视图）
   - `supabase/seed.sql`（预置国家队）
4. Supabase 控制台 → Authentication → Providers 启用 **Google**，回调填 `https://<你的域名>/auth/callback`（本地加 `http://localhost:3000/auth/callback`）
5. `npm run dev` → http://localhost:3000

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 项目地址 + anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key，仅服务端 cron / 结算用 |
| `ODDS_API_KEY` | the-odds-api 免费 key（500 次/月足够每日刷新）|
| `CRON_SECRET` | 保护 cron 路由；Vercel 设置后会自动带 `Authorization: Bearer` |
| `NEXT_PUBLIC_SITE_URL` | 站点地址（OAuth 回调用）|

## 定时任务

`vercel.json` 已配置两个 cron（UTC）：

- `/api/cron/refresh-odds` —— 每天 08:00：拉未开赛比赛 + 赔率，按需建球队，upsert 比赛
- `/api/cron/settle` —— 每天 06:00：拉已结束比分，标记结果并结算注单

本地手动触发：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh-odds
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/settle
```

## 部署到 Vercel

1. 导入仓库到 Vercel
2. 配置上述全部环境变量
3. 部署后把 Vercel 域名加入 Supabase 的 Google OAuth 回调白名单
4. Cron 由 `vercel.json` 自动注册
