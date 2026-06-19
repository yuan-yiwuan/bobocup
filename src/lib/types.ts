/** 共享业务类型。 */

export type Pick = "home" | "draw" | "away";
export type BetStatus = "pending" | "won" | "lost";
export type MatchStatus = "scheduled" | "finished";

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
