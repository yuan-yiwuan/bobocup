-- 0003: 系统元数据键值表（用于记录结算 cron 的心跳：上次运行时间）
-- 在 Supabase SQL Editor 运行。
--
-- 用途：settle cron 每次运行（含「无可结算比赛」的空跑）都 upsert
--   key='last_settle_run' 的 value=当前时间，前端据此显示「上次结算检查时间」，
--   让用户知道结算系统在正常运转。cron 走 service-role key 写入，绕过 RLS。

create table if not exists public.app_meta (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_meta enable row level security;

-- 所有登录用户可读（朋友间游戏，公开元数据）
drop policy if exists "app_meta_read" on public.app_meta;
create policy "app_meta_read" on public.app_meta
  for select to authenticated using (true);
