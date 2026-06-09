-- 0002: 主队多倍下注 + 锁定下单赔率
-- 在 Supabase SQL Editor 运行。
--
-- 变更：
--  - 下注额可为 100 的 1~3 倍（100/200/300）
--  - 仅当投注的是"自己的主队"时才允许 >100（多倍）
--  - 平局或非主队一律 100
--  - 赔率锁定（odds_snapshot）由应用在下单/改注时写入，结算读取它，不在此处理

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
  picked_team int;
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

    -- 多倍（>100）只允许投注自己的主队
    if new.stake > 100 then
      picked_team := case new.pick
                       when 'home' then m_home
                       when 'away' then m_away
                       else null
                     end;
      select home_team_id into user_home
        from public.profiles where id = new.user_id;
      if picked_team is null or user_home is null or picked_team <> user_home then
        raise exception '只有投注自己的主队才能多倍下注';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 取消投注需要 DELETE 权限：只能删自己的、且比赛尚未开赛
drop policy if exists "bets_delete_own" on public.bets;
create policy "bets_delete_own" on public.bets
  for delete to authenticated
  using (
    auth.uid() = user_id
    and (select commence_time from public.matches where id = match_id) > now()
  );
