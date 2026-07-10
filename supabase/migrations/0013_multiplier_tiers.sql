-- 0013: 加倍规则改为三档
-- 在 Supabase SQL Editor 运行。
--
-- 变更（比赛注单加倍上限）：
--  1) 任何比赛都可下注 1~2 倍；
--  2) 自己主队参与的比赛（主队在场，胜/平/负任选）可 1~3 倍；
--  3) 押主队赢（投注项正好是主队那一侧）可 1~5 倍。
--     base：h2h=100，advance(淘汰赛)=200。上限 = base × 允许倍数。

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
  ht_side    text;  -- 主队在本场对应的投注项（不在本场为 null）
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

    -- 主队在本场对应哪一侧
    select home_team_id into user_home
      from public.profiles where id = new.user_id;
    ht_side := case
      when user_home is not null and user_home = m_home then 'home'
      when user_home is not null and user_home = m_away then 'away'
      else null end;

    -- 允许的最大倍数：任何比赛 2 倍；主队的比赛 3 倍；押主队赢 5 倍
    max_mult := 2;
    if ht_side is not null then
      max_mult := 3;
      if new.pick = ht_side then
        max_mult := 5;
      end if;
    end if;

    if new.stake > base * max_mult then
      raise exception '下注额超过上限';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
