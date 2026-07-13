-- 0014: 加倍规则改为两档 —— 任何比赛 ×2，有主队参加的比赛 ×5
-- 在 Supabase SQL Editor 运行。
--
-- 变更（比赛注单加倍上限）：
--  1) 任何比赛都可下注 1~2 倍；
--  2) 自己主队参与的比赛（主队在场，胜/平/负任选）可 1~5 倍。
--     base：h2h=100，advance(淘汰赛)=200。上限 = base × 允许倍数。
-- 取代 0013 的三档（押主队赢×5）逻辑。

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
  max_mult   int;   -- 本注允许的最大倍数
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

    -- 下注额必须是 base 的 1~5 倍
    if new.stake not in (base, base * 2, base * 3, base * 4, base * 5) then
      raise exception '下注额不合法';
    end if;

    -- 允许的最大倍数：任何比赛 2 倍；有主队参加的比赛 5 倍（胜/平/负任选）
    max_mult := 2;
    select home_team_id into user_home
      from public.profiles where id = new.user_id;
    if user_home is not null and (user_home = m_home or user_home = m_away) then
      max_mult := 5;
    end if;

    if new.stake > base * max_mult then
      raise exception '下注额超过上限';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
