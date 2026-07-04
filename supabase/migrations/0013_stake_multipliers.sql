-- 0013: 投注倍数放宽 —— 所有比赛可 2 倍，自己主队的比赛最多 3 倍
-- 在 Supabase SQL Editor 运行。
--
-- 变更（相对 0010）：
--  - 任何比赛都可投 base 的 1~2 倍。
--  - 「自己主队的比赛」（主队踢主场或客场都行，胜/平/负任选）可投 base 的 1~3 倍。
--  - 即：3 倍仅限自己主队的比赛。
--    小组赛 base=100（普通 100~200，主队 100~300）
--    淘汰赛 base=200（普通 200~400，主队 200~600）

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

    -- 3 倍（>base*2）只允许「自己主队的比赛」（主队在场，胜/平/负任选）
    if new.stake > base * 2 then
      select home_team_id into user_home
        from public.profiles where id = new.user_id;
      if user_home is null or (user_home <> m_home and user_home <> m_away) then
        raise exception '只有自己主队的比赛才能投 3 倍';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
