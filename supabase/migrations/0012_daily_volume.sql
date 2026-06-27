-- 0012: 每日竞猜池加 volume（成交量/热度），用于加权随机挑选
-- 在 Supabase SQL Editor 运行。

alter table public.outright_markets
  add column if not exists volume numeric not null default 0;
