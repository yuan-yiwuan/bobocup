/** 共享业务类型。 */

export type Pick = "home" | "draw" | "away";
export type BetStatus = "pending" | "won" | "lost";
export type MatchStatus = "scheduled" | "finished";
/**
 * 玩法类型：
 *  - h2h     小组赛三路（主/平/客），赔率来自 the-odds-api（历史数据）
 *  - advance 淘汰赛二路（谁晋级），赔率来自 Polymarket 晋级概率，结算用 openfootball
 */
export type BetType = "h2h" | "advance";

export interface Team {
  id: number;
  name_zh: string;
  name_en: string;
  flag_emoji: string | null;
  group_letter: string | null;
}

export interface Player {
  id: string;
  team_id: number;
  shirt_number: number | null;
  name: string;
  position: string | null;
  club: string | null;
  club_country: string | null;
  market_value: number | null;
  photo_url: string | null;
  injured: boolean;
  injury_note: string | null;
  tm_player_id: string | null;
  dob: string | null;
  sort_order: number | null;
}

export interface Profile {
  id: string;
  nickname: string | null;
  home_team_id: number | null;
  created_at: string;
}

export interface Match {
  id: string;
  home_team_id: number | null;
  away_team_id: number | null;
  home_team_name: string;
  away_team_name: string;
  commence_time: string;
  status: MatchStatus;
  bet_type: BetType;
  home_score: number | null;
  away_score: number | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  odds_updated_at: string | null;
  result: Pick | null;
  settled: boolean;
}

export interface Bet {
  id: string;
  user_id: string;
  match_id: string;
  pick: Pick;
  stake: number;
  odds_snapshot: number | null;
  payout: number | null;
  status: BetStatus;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardRow {
  id: string;
  nickname: string | null;
  home_team_id: number | null;
  settled_bets: number;
  won_bets: number;
  total_staked: number;
  total_returned: number;
  /**
   * DB 视图里的旧毒奶指数（百分比）。UI 已改为客户端按
   * total_staked − total_returned（净亏胡萝卜数）重新计算，不再使用此字段。
   */
  milk_index: number | null;
}

/** 每注固定下注的胡萝卜数量。 */
export const STAKE = 100;

// ── 长期盘（outright/futures）：金靴、夺冠…… ──────────────────────

export type OutrightKind = "golden_boot" | "champion" | "daily";

export interface OutrightMarket {
  id: string; // Polymarket event slug
  title: string;
  kind: OutrightKind;
  outcome_label: string; // '球员' / '球队' / '选项'
  settled: boolean;
  result_outcome_id: number | null;
  updated_at: string;
  // 每日竞猜（kind='daily'）专用
  pool: boolean; // 是否在每日竞猜池中
  featured_date: string | null; // 被选为「今日竞猜」的日期（太平洋，YYYY-MM-DD）
  category: string | null; // trump / culture / player_h2h / ...
  closed: boolean; // Polymarket 上是否已结束
}

export interface OutrightOutcome {
  id: number;
  market_id: string;
  name: string;
  name_zh: string | null;
  team_id: number | null;
  prob: number | null;
  odds: number | null;
  image_url: string | null;
  sort_order: number | null;
  closed: boolean;
  updated_at: string;
}

export interface OutrightBet {
  id: string;
  user_id: string;
  market_id: string;
  outcome_id: number;
  stake: number;
  odds_snapshot: number | null;
  payout: number | null;
  status: BetStatus;
  created_at: string;
  updated_at: string;
}
