-- 波波杯毒奶王中王争霸赛 —— 初始 schema
-- 在 Supabase SQL Editor 中运行（或用 supabase CLI 迁移）。

-- ============================================================
-- 表
-- ============================================================

-- 球队
create table if not exists public.teams (
  id serial primary key,
  name_zh text not null,
  name_en text not null,
  flag_emoji text,
  group_letter text
);
-- 按英文队名（小写）唯一，便于 cron 从 the-odds-api 匹配/去重
create unique index if not exists teams_name_en_lower_idx
  on public.teams (lower(name_en));

-- 用户资料（关联 auth.users）
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  home_team_id int references public.teams(id),
  created_at timestamptz not null default now()
);

-- 比赛（id 用 the-odds-api 的 event id）
create table if not exists public.matches (
  id text primary key,
  home_team_id int references public.teams(id),
  away_team_id int references public.teams(id),
  home_team_name text not null,
  away_team_name text not null,
  commence_time timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','finished')),
  home_score int,
  away_score int,
  odds_home numeric,
  odds_draw numeric,
  odds_away numeric,
  odds_updated_at timestamptz,
  result text check (result in ('home','draw','away')),
  settled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists matches_commence_idx on public.matches (commence_time);

-- 投注（每人每场一注，开赛前可改）
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  pick text not null check (pick in ('home','draw','away')),
  stake int not null default 100,
  odds_snapshot numeric,
  payout int,
  status text not null default 'pending' check (status in ('pending','won','lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists bets_user_idx on public.bets (user_id);
create index if not exists bets_match_idx on public.bets (match_id);

-- ============================================================
-- 触发器
-- ============================================================

-- 新用户注册后自动建一行 profile（昵称留空，引导用户去 onboarding）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 下注校验：仅开赛前可下注/改注；强制固定下注额 100；维护 updated_at。
-- 仅在 INSERT 或 pick 变更时校验开赛时间，使结算（改 status/payout）不受影响。
create or replace function public.check_bet_before_kickoff()
returns trigger
language plpgsql
as $$
declare
  m_time timestamptz;
  m_status text;
begin
  if tg_op = 'INSERT' or new.pick is distinct from old.pick then
    select commence_time, status into m_time, m_status
      from public.matches where id = new.match_id;
    if m_time is null then
      raise exception '比赛不存在';
    end if;
    if now() >= m_time or m_status = 'finished' then
      raise exception '比赛已开赛，无法下注或改注';
    end if;
    new.stake := 100;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bets_before_kickoff on public.bets;
create trigger bets_before_kickoff
  before insert or update on public.bets
  for each row execute function public.check_bet_before_kickoff();

-- ============================================================
-- 排行榜视图（毒奶指数）
--   毒奶指数 = (已结算下注总额 - 已结算回报总额) / 已结算下注总额 * 100%
--   指数越高 = 越毒奶。无已结算注单时为 null。
-- ============================================================

create or replace view public.leaderboard
with (security_invoker = on)
as
select
  p.id,
  p.nickname,
  p.home_team_id,
  count(b.id) filter (where b.status in ('won','lost')) as settled_bets,
  count(b.id) filter (where b.status = 'won') as won_bets,
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
left join public.bets b on b.user_id = p.id
group by p.id, p.nickname, p.home_team_id;

-- ============================================================
-- 行级安全（RLS）
--   朋友间游戏：所有登录用户可读所有数据（排行榜要看到彼此），仅可写自己的数据。
--   cron / 结算走 service-role key，自动绕过 RLS。
-- ============================================================

alter table public.teams    enable row level security;
alter table public.profiles enable row level security;
alter table public.matches  enable row level security;
alter table public.bets     enable row level security;

drop policy if exists "teams_read" on public.teams;
create policy "teams_read" on public.teams
  for select to authenticated using (true);

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches
  for select to authenticated using (true);

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_upsert_own" on public.profiles;
create policy "profiles_upsert_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "bets_read" on public.bets;
create policy "bets_read" on public.bets
  for select to authenticated using (true);

drop policy if exists "bets_insert_own" on public.bets;
create policy "bets_insert_own" on public.bets
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "bets_update_own" on public.bets;
create policy "bets_update_own" on public.bets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
