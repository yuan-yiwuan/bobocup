-- 0015: 胡萝卜王用「蔬菜」下注，与胡萝卜收成榜脱钩
-- 在 Supabase SQL Editor 运行。
--
-- 变更：leaderboard 视图不再计入 kind='carrot_king' 的特别竞猜注单，
--       即胡萝卜王的下注/赢取是独立的「蔬菜」，不影响净胡萝卜（收成榜/毒奶榜）。

create or replace view public.leaderboard
with (security_invoker = on)
as
with all_bets as (
  select user_id, stake, payout, status from public.bets
  union all
  select ob.user_id, ob.stake, ob.payout, ob.status
  from public.outright_bets ob
  where ob.market_id not in (
    select id from public.outright_markets where kind = 'carrot_king'
  )
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
