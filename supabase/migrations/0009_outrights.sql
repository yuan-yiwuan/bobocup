-- 0009: 长期盘（outright/futures）—— 与单场无关的竞猜：金靴、夺冠……
-- 在 Supabase SQL Editor 运行。
--
-- 设计：
--  - outright_markets   一个盘（金靴 / 夺冠），id 用 Polymarket event slug
--  - outright_outcomes  盘里的候选项（球员 / 球队）+ 当前概率/倍数
--  - outright_bets      每人每盘一注；下注那刻锁定 odds_snapshot
--  - 一直开放到分晓：盘未 settled 即可投/改/撤；结算用 Polymarket 结果
--  - 排行榜并入 outright_bets 的胡萝卜盈亏

-- ============================================================
-- 表
-- ============================================================

create table if not exists public.outright_markets (
  id text primary key,                 -- Polymarket event slug，如 'world-cup-golden-boot-winner'
  title text not null,                 -- 展示标题，如 '金靴'
  kind text not null,                  -- 'golden_boot' | 'champion'
  outcome_label text not null,         -- 选项是什么：'球员' / '球队'
  settled boolean not null default false,
  result_outcome_id bigint,            -- 结算后指向获胜项
  updated_at timestamptz not null default now()
);

create table if not exists public.outright_outcomes (
  id bigserial primary key,
  market_id text not null references public.outright_markets(id) on delete cascade,
  name text not null,                  -- Polymarket groupItemTitle，如 'Lionel Messi' / 'France'
  name_zh text,                        -- 中文名（球队可映射；球员暂空）
  team_id int references public.teams(id),  -- 夺冠盘关联球队（国旗/中文）；金靴为空
  prob numeric,                        -- 当前隐含概率（0-1）
  odds numeric,                        -- 1/prob（展示倍数）
  image_url text,
  sort_order int,                      -- 按概率排序（小=靠前）
  closed boolean not null default false,  -- 该项已出局/已结算（Polymarket 子市场 closed）
  updated_at timestamptz not null default now(),
  unique (market_id, name)
);
create index if not exists outright_outcomes_market_idx
  on public.outright_outcomes (market_id);

create table if not exists public.outright_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id text not null references public.outright_markets(id) on delete cascade,
  outcome_id bigint not null references public.outright_outcomes(id) on delete cascade,
  stake int not null default 100,
  odds_snapshot numeric,
  payout int,
  status text not null default 'pending' check (status in ('pending','won','lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, market_id)          -- 每人每盘一注
);
create index if not exists outright_bets_user_idx on public.outright_bets (user_id);
create index if not exists outright_bets_market_idx on public.outright_bets (market_id);

-- ============================================================
-- 下注校验触发器：盘未分晓 + 选项未出局才可投/改；强制 stake=100
-- ============================================================

create or replace function public.check_outright_bet()
returns trigger
language plpgsql
as $$
declare
  m_settled boolean;
  o_closed  boolean;
  o_market  text;
begin
  if tg_op = 'INSERT' or new.outcome_id is distinct from old.outcome_id then
    select settled into m_settled from public.outright_markets where id = new.market_id;
    if m_settled is null then
      raise exception '竞猜项不存在';
    end if;
    if m_settled then
      raise exception '该竞猜已分晓，无法下注或改注';
    end if;
    -- 选项必须属于本盘且未出局
    select closed, market_id into o_closed, o_market
      from public.outright_outcomes where id = new.outcome_id;
    if o_market is distinct from new.market_id then
      raise exception '选项与竞猜不匹配';
    end if;
    if o_closed then
      raise exception '该选项已出局，无法选择';
    end if;
    new.stake := 100;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists outright_bets_check on public.outright_bets;
create trigger outright_bets_check
  before insert or update on public.outright_bets
  for each row execute function public.check_outright_bet();

-- ============================================================
-- 行级安全（RLS）：登录可读全部；仅可写自己的；撤注仅限未分晓
-- ============================================================

alter table public.outright_markets  enable row level security;
alter table public.outright_outcomes enable row level security;
alter table public.outright_bets     enable row level security;

drop policy if exists "outright_markets_read" on public.outright_markets;
create policy "outright_markets_read" on public.outright_markets
  for select to authenticated using (true);

drop policy if exists "outright_outcomes_read" on public.outright_outcomes;
create policy "outright_outcomes_read" on public.outright_outcomes
  for select to authenticated using (true);

drop policy if exists "outright_bets_read" on public.outright_bets;
create policy "outright_bets_read" on public.outright_bets
  for select to authenticated using (true);

drop policy if exists "outright_bets_insert_own" on public.outright_bets;
create policy "outright_bets_insert_own" on public.outright_bets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "outright_bets_update_own" on public.outright_bets;
create policy "outright_bets_update_own" on public.outright_bets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "outright_bets_delete_own" on public.outright_bets;
create policy "outright_bets_delete_own" on public.outright_bets
  for delete to authenticated
  using (
    auth.uid() = user_id
    and not (select settled from public.outright_markets where id = market_id)
  );

-- ============================================================
-- 排行榜视图并入 outright_bets（胡萝卜盈亏一起算）
-- ============================================================

create or replace view public.leaderboard
with (security_invoker = on)
as
with all_bets as (
  select user_id, stake, payout, status from public.bets
  union all
  select user_id, stake, payout, status from public.outright_bets
)
select
  p.id,
  p.nickname,
  p.home_team_id,
  count(*) filter (where b.status in ('won','lost')) as settled_bets,
  count(*) filter (where b.status = 'won') as won_bets,
  coalesce(sum(b.stake)  filter (where b.status in ('won','lost')), 0) as total_staked,
  coalesce(sum(b.payout) filter (where b.status in ('won','lost')), 0) as total_returned,
  case
    when coalesce(sum(b.stake) filter (where b.status in ('won','lost')), 0) = 0 then null
    else round(
      (coalesce(sum(b.stake)  filter (where b.status in ('won','lost')), 0)
     - coalesce(sum(b.payout) filter (where b.status in ('won','lost')), 0))::numeric
      / nullif(sum(b.stake) filter (where b.status in ('won','lost')), 0) * 100, 1)
  end as milk_index
from public.profiles p
left join all_bets b on b.user_id = p.id
group by p.id, p.nickname, p.home_team_id;
