import type { ContestStatus, ScoreRound } from './types';

export const STATUS_LABEL: Record<ContestStatus, string> = {
  recruiting: '모집중',
  ongoing: '진행중',
  judging: '심사중',
  closed: '종료',
};

export const ROUND_LABEL: Record<ScoreRound, string> = { preliminary: '예선', final: '결선' };
export const ROUNDS: ScoreRound[] = ['preliminary', 'final'];
