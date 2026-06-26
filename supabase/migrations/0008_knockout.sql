-- 0008: 淘汰赛「晋级」玩法
-- 在 Supabase SQL Editor 运行。
--
-- 变更：matches 加一列 bet_type 区分玩法。
--  - 'h2h'     小组赛三路（主/平/客）—— 既有行默认归到这里
--  - 'advance' 淘汰赛二路（谁晋级），复用 pick/result 的 'home'/'away'
--             （home=主队晋级，away=客队晋级，不会有 'draw'）
-- pick/result 的 check 本就是 ('home','draw','away')，无需改动。

alter table public.matches
  add column if not exists bet_type text not null default 'h2h'
    check (bet_type in ('h2h', 'advance'));
