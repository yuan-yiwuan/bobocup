-- 球员大名单（每支国家队的世界杯名单 + Transfermarkt 富信息）
-- 数据来源：
--   名单骨架（号码/位置/名字/效力俱乐部）：openfootball 2026 世界杯名单
--   身价/照片/是否受伤：Transfermarkt 国家队阵容页（按 名字+生日 关联）
-- 由 scripts/seed-squads.mjs 用 service-role 写入（绕过 RLS）。

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id int not null references public.teams(id) on delete cascade,
  shirt_number int,                 -- 球衣号码（世界杯官方名单）
  name text not null,
  position text,                    -- GK / DF / MF / FW
  club text,                        -- 效力俱乐部
  club_country text,                -- 俱乐部所属国家（FIFA 三字码）
  market_value bigint,              -- 身价（欧元），来自 Transfermarkt
  photo_url text,                   -- 球员照片，来自 Transfermarkt
  injured boolean not null default false,
  injury_note text,                 -- 伤情备注（如有）
  tm_player_id text,                -- Transfermarkt 球员 id（缓存，便于复跑）
  dob date,                         -- 生日（用于名字消歧）
  sort_order int,                   -- 名单原始顺序，保证展示稳定
  updated_at timestamptz not null default now()
  -- 不对 (team_id, name) 加唯一约束：国家队可能有同名球员（如巴西双 Danilo）。
  -- 导入脚本按队「先删后插」整队覆盖，不依赖唯一约束。
);
create index if not exists players_team_idx on public.players (team_id);

-- RLS：与 teams/matches 一致，登录用户可读；写入走 service-role。
alter table public.players enable row level security;

drop policy if exists "players_read" on public.players;
create policy "players_read" on public.players
  for select to authenticated using (true);
