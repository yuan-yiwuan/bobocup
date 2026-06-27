-- 0011: 每日竞猜（daily）—— 从世界杯相关 Polymarket 池子每天轮换一个
-- 在 Supabase SQL Editor 运行。
--
-- 复用 outright_* 三表：每日竞猜是 kind='daily' 的行。
--  - pool          是否在每日池中
--  - featured_date 被选为「今日竞猜」的太平洋日期
--  - category      trump/culture/player_h2h/... 用于挑选优先级
--  - closed        Polymarket 上是否已结束（挑选时过滤）
-- 玩法：一注 100、不可改、当天有效；下注走服务端接口实时校验（<80% 且未结束）。

alter table public.outright_markets
  add column if not exists pool boolean not null default false,
  add column if not exists featured_date date,
  add column if not exists category text,
  add column if not exists closed boolean not null default false;

create index if not exists outright_markets_daily_idx
  on public.outright_markets (kind, featured_date);

-- 下注校验：注额按玩法（daily=100，其它 outright=200）；其余不变（不可改、未分晓、选项未出局）
create or replace function public.check_outright_bet()
returns trigger
language plpgsql
as $$
declare
  m_settled boolean;
  m_kind    text;
  o_closed  boolean;
  o_market  text;
begin
  if tg_op = 'UPDATE' then
    if new.outcome_id is distinct from old.outcome_id then
      raise exception '特别竞猜一旦竞猜不可修改';
    end if;
    new.updated_at := now();
    return new;
  end if;

  select settled, kind into m_settled, m_kind
    from public.outright_markets where id = new.market_id;
  if m_settled is null then
    raise exception '竞猜项不存在';
  end if;
  if m_settled then
    raise exception '该竞猜已分晓，无法竞猜';
  end if;
  select closed, market_id into o_closed, o_market
    from public.outright_outcomes where id = new.outcome_id;
  if o_market is distinct from new.market_id then
    raise exception '选项与竞猜不匹配';
  end if;
  if o_closed then
    raise exception '该选项已出局';
  end if;
  new.stake := case when m_kind = 'daily' then 100 else 200 end;
  new.updated_at := now();
  return new;
end;
$$;

-- daily 注单只能由服务端（service-role 接口，实时校验后）写入，
-- 客户端直连插入仅限非 daily（金靴/夺冠）。
drop policy if exists "outright_bets_insert_own" on public.outright_bets;
create policy "outright_bets_insert_own" on public.outright_bets
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (select kind from public.outright_markets where id = market_id) <> 'daily'
  );
