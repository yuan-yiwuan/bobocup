-- 0014: 淘汰赛轮次列 —— 记录每场淘汰赛属于哪一轮（含季军赛）
-- 在 Supabase SQL Editor 运行。
--
-- 变更：
--  - matches 加一列 round（可空）：round_of_32 / round_of_16 / quarterfinal /
--    semifinal / final / third_place。小组赛（h2h）留空。
--  - 由刷新脚本（refresh-odds）在写入淘汰赛对阵时一并写入。
--  - 前端用它区分季军赛（投注上限单独封顶 x2）。

alter table public.matches
  add column if not exists round text;
