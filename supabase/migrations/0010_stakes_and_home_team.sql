-- 0010: 下注金额规则调整 + outright 不可改 + 主队被淘汰后可改选
-- 在 Supabase SQL Editor 运行。
--
-- 变更：
--  1) 比赛注单 base 按玩法：h2h=100，advance(淘汰赛)=200；
--     主队参与的比赛可 1~3 倍（base / base*2 / base*3），上限 600（=200×3）。
--  2) outright（金靴/夺冠）一注固定 200，且一旦下注不可修改/撤销。
--  3) 主队：选定后锁定；仅当主队已无未开赛比赛（被淘汰）时可改选。

-- ============================================================
-- 1) 比赛注单：base 随玩法，主队比赛可多倍
-- ============================================================

create or replace function public.check_bet_before_kickoff()
returns trigger
language plpgsql
as $$
declare
  m_commence timestamptz;
  m_status   text;
  m_home     int;
  m_away     int;
  m_bettype  text;
  user_home  int;
  base       int;
begin
  if tg_op = 'INSERT'
     or new.pick  is distinct from old.pick
     or new.stake is distinct from old.stake then

    select commence_time, status, home_team_id, away_team_id, bet_type
      into m_commence, m_status, m_home, m_away, m_bettype
      from public.matches where id = new.match_id;
    if not found then
      raise exception '比赛不存在';
    end if;
    if now() >= m_commence or m_status = 'finished' then
      raise exception '比赛已开赛，无法下注或改注';
    end if;

    base := case when m_bettype = 'advance' then 200 else 100 end;

    -- 下注额必须是 base 的 1~3 倍
    if new.stake not in (base, base * 2, base * 3) then
      raise exception '下注额不合法';
    end if;

    -- 多倍（>base）只允许「自己主队的比赛」（主队在场，胜/平/负任选）
    if new.stake > base then
      select home_team_id into user_home
        from public.profiles where id = new.user_id;
      if user_home is null or (user_home <> m_home and user_home <> m_away) then
        raise exception '只有自己主队的比赛才能多倍下注';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- 2) outright：固定 200，且不可修改/撤销
-- ============================================================

alter table public.outright_bets alter column stake set default 200;

create or replace function public.check_outright_bet()
returns trigger
language plpgsql
as $$
declare
  m_settled boolean;
  o_closed  boolean;
  o_market  text;
begin
  if tg_op = 'UPDATE' then
    -- 一旦下注不可修改（选项不能变）
    if new.outcome_id is distinct from old.outcome_id then
      raise exception '特别竞猜一旦下注不可修改';
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- INSERT：盘未分晓 + 选项未出局才可投；强制 200
  select settled into m_settled from public.outright_markets where id = new.market_id;
  if m_settled is null then
    raise exception '竞猜项不存在';
  end if;
  if m_settled then
    raise exception '该竞猜已分晓，无法下注';
  end if;
  select closed, market_id into o_closed, o_market
    from public.outright_outcomes where id = new.outcome_id;
  if o_market is distinct from new.market_id then
    raise exception '选项与竞猜不匹配';
  end if;
  if o_closed then
    raise exception '该选项已出局，无法选择';
  end if;
  new.stake := 200;
  new.updated_at := now();
  return new;
end;
$$;

-- 不可撤销：移除撤注权限
drop policy if exists "outright_bets_delete_own" on public.outright_bets;

-- ============================================================
-- 3) 主队：被淘汰（无未开赛比赛）后才能改选
-- ============================================================

create or replace function public.check_home_team_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.home_team_id is distinct from old.home_team_id
     and old.home_team_id is not null then
    -- 旧主队仍有未开赛比赛 = 还在比赛中，不能换
    if exists (
      select 1 from public.matches
      where status = 'scheduled' and commence_time > now()
        and (home_team_id = old.home_team_id or away_team_id = old.home_team_id)
    ) then
      raise exception '主队还在比赛中，暂不能更换';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_home_team_change on public.profiles;
create trigger profiles_home_team_change
  before update on public.profiles
  for each row execute function public.check_home_team_change();
