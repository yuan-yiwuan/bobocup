-- 1) 排行榜「相对上一天」趋势：每日太平洋时间 0:00 跑 job 存一份排名快照。
create table if not exists public.rank_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  board text not null check (board in ('milk', 'profit')),
  rank int not null,
  day date not null,                 -- 快照所属的太平洋时区日期
  created_at timestamptz not null default now(),
  primary key (user_id, board, day)
);
create index if not exists rank_snapshots_day_idx on public.rank_snapshots (day);

alter table public.rank_snapshots enable row level security;
drop policy if exists "rank_snapshots_read" on public.rank_snapshots;
create policy "rank_snapshots_read" on public.rank_snapshots
  for select to authenticated using (true);

-- 2) 有大名单的球队（≤48 行）。/squad 列表用它来判断哪些队有名单，
--    绕开 PostgREST 单次最多返回 1000 行的限制（players 有 1248 行会被截断）。
create or replace view public.squad_teams
with (security_invoker = on)
as
  select team_id, count(*)::int as player_count
  from public.players
  group by team_id;
