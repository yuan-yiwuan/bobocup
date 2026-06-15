-- 0004: 主队加成放宽 —— 只要是「自己主队的比赛」，胜/平/负任选都可多倍（1~3 倍）
-- 在 Supabase SQL Editor 运行。
--
-- 变更（相对 0002）：
--  - 多倍（>100）的条件从「投注的是自己主队、且押其赢」放宽为
--    「这场比赛里有自己的主队」（主队踢主场或客场都行），押胜/平/负均可。

create or replace function public.check_bet_before_kickoff()
returns trigger
language plpgsql
as $$
declare
  m_commence timestamptz;
  m_status   text;
  m_home     int;
  m_away     int;
  user_home  int;
begin
  -- 仅在 INSERT 或 pick/stake 变化时校验（结算只改 status/payout，不受影响）
  if tg_op = 'INSERT'
     or new.pick  is distinct from old.pick
     or new.stake is distinct from old.stake then

    select commence_time, status, home_team_id, away_team_id
      into m_commence, m_status, m_home, m_away
      from public.matches where id = new.match_id;
    if not found then
      raise exception '比赛不存在';
    end if;
    if now() >= m_commence or m_status = 'finished' then
      raise exception '比赛已开赛，无法下注或改注';
    end if;

    -- 下注额必须是 100 的 1~3 倍
    if new.stake not in (100, 200, 300) then
      raise exception '下注额必须是 100 的 1~3 倍';
    end if;

    -- 多倍（>100）只允许「自己主队的比赛」（主队在场，胜/平/负任选）
    if new.stake > 100 then
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
