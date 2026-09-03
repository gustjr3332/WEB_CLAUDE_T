import type { ContestStatus, ScoreRound } from './types';

export const STATUS_LABEL: Record<ContestStatus, string> = {
  recruiting: '모집중',
  ongoing: '진행중',
  judging: '심사중',
  closed: '종료',
};

// 상태 전이 순서: 모집중 → 진행중 → 심사중 → 종료
export const STATUS_ORDER: ContestStatus[] = ['recruiting', 'ongoing', 'judging', 'closed'];

export const STATUS_HINT: Record<ContestStatus, string> = {
  recruiting: '팀 생성·참가와 제출물 등록이 가능합니다.',
  ongoing: '팀 생성·참가와 제출물 등록이 가능합니다. 채점은 심사중 상태부터 열립니다.',
  judging: '제출물이 잠기고 심사위원 채점이 열립니다.',
  closed: '모든 입력이 닫히고 최종 결과만 표시됩니다.',
};

export const ROUND_LABEL: Record<ScoreRound, string> = { preliminary: '예선', final: '결선' };
export const ROUNDS: ScoreRound[] = ['preliminary', 'final'];
