import type { ContestStatus } from './types';

// 대회 상태별 허용 동작. 백엔드 `contests/views.py`의 *_STATUSES 와 동일하게 유지한다.
// 여기서 막는 것은 UI 안내용이고, 실제 강제는 서버가 한다.

export function canFormTeams(status: ContestStatus): boolean {
  return status === 'recruiting' || status === 'ongoing';
}

export function canSubmit(status: ContestStatus): boolean {
  return status === 'recruiting' || status === 'ongoing';
}

export function canScore(status: ContestStatus): boolean {
  return status === 'judging';
}

export function isLive(status: ContestStatus): boolean {
  return status !== 'closed';
}
