export type ContestStatus = 'recruiting' | 'ongoing' | 'judging' | 'closed';

export interface Contest {
  slug: string;
  name: string;
  description: string;
  status: ContestStatus;
  start_at: string;
  end_at: string;
  created_at: string;
  updated_at: string;
  team_count: number;
  /** 요청한 사용자가 이 대회의 심사위원인지 (서버 판단, 폴링으로 갱신). */
  is_judge: boolean;
}

export interface ContestInput {
  slug: string;
  name: string;
  description: string;
  start_at: string;
  end_at: string;
}

export interface Participant {
  id: number;
  team: number;
  username: string;
  joined_at: string;
}

export interface Submission {
  id: number;
  team: number;
  title: string;
  description: string;
  link_url: string;
  repo_url: string;
  submitted_at: string;
}

export interface Team {
  id: number;
  contest: string;
  name: string;
  created_at: string;
  participants: Participant[];
  submission: Submission | null;
}

export type ScoreRound = 'preliminary' | 'final';

export interface Judge {
  id: number;
  contest: string;
  username: string;
  /** 이 심사위원이 입력한 점수 수. 0 보다 크면 해제할 수 없다. */
  score_count: number;
}

export interface Me {
  username: string;
  is_staff: boolean;
}

export interface Score {
  id: number;
  submission: number;
  judge: number;
  judge_username: string;
  round: ScoreRound;
  value: string;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface ScoreboardEntry {
  team_id: number;
  team_name: string;
  submission_title: string | null;
  round: ScoreRound;
  average_score: string | null;
  vote_count: number;
  /** 라운드 내 순위. 점수가 없는 팀은 null. 동점은 같은 순위. */
  rank: number | null;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}
