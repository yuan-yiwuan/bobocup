-- 去掉 players(team_id, name) 唯一约束。
-- 国家队存在同名球员（如巴西的两名 Danilo），该约束会让整队导入失败。
-- 导入脚本按队「先删后插」覆盖，不需要这个唯一约束。
alter table public.players drop constraint if exists players_team_id_name_key;
