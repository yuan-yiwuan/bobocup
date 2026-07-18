-- 0016: 三四名决赛（季军赛）竞猜
-- 在 Supabase SQL Editor 运行。
--
-- 变更：matches 加一列 round，记录淘汰赛轮次（openfootball 轮次 key）。
--  - 季军赛复用 bet_type='advance' 的两路玩法（谁夺季军 = 谁赢这场，home/away）
--  - round 仅用于前端把季军赛按钮文案从「晋级」改成「夺季军」；小组赛/历史行留空
--  下一次 refresh-odds 运行时会回填即将开赛场次的 round。

alter table public.matches
  add column if not exists round text;
