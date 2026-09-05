import { useState } from 'react';
import { assignPresentationOrder } from './api';
import type { Contest, Team } from './types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

interface PresentationScheduleProps {
  contest: Contest;
  teams: Team[];
  isOrganizer: boolean;
  onAssigned: (contest: Contest) => void;
}

/** 제출 마감 후 팀별 발표 순서·시간표. 운영자는 시작 시각을 정해 순서를 배정/재배정할 수 있다. */
export function PresentationSchedule({ contest, teams, isOrganizer, onAssigned }: PresentationScheduleProps) {
  const [startAtInput, setStartAtInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const scheduled = teams
    .filter((t) => t.presentation_order != null)
    .sort((a, b) => (a.presentation_order ?? 0) - (b.presentation_order ?? 0));

  const now = Date.now();

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const startAtIso = startAtInput ? new Date(startAtInput).toISOString() : undefined;
      const updated = await assignPresentationOrder(contest.slug, startAtIso);
      onAssigned(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '발표 순서 배정에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!isOrganizer && scheduled.length === 0) return null;

  return (
    <div>
      <h3 className="section-heading">발표 일정</h3>
      {isOrganizer && (
        <form className="presentation-assign-form" onSubmit={handleAssign}>
          <input
            type="datetime-local"
            value={startAtInput}
            onChange={(e) => setStartAtInput(e.target.value)}
            aria-label="발표 시작 시각"
          />
          <button type="submit" disabled={busy}>
            {scheduled.length > 0 ? '발표 순서 다시 배정' : '발표 순서 배정'}
          </button>
          <span className="empty-hint">
            비워두면 지금부터 팀당 {contest.presentation_minutes}분씩 배정합니다.
          </span>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}

      {scheduled.length === 0 ? (
        <p className="empty-hint">아직 발표 순서가 배정되지 않았습니다.</p>
      ) : (
        <ol className="presentation-list">
          {scheduled.map((team) => {
            const start = team.presentation_starts_at ? new Date(team.presentation_starts_at).getTime() : null;
            const end = team.presentation_ends_at ? new Date(team.presentation_ends_at).getTime() : null;
            const isCurrent = start != null && end != null && now >= start && now < end;
            const isDone = end != null && now >= end;
            return (
              <li
                key={team.id}
                className={`presentation-row${isCurrent ? ' current' : ''}${isDone ? ' done' : ''}`}
              >
                <span className="presentation-order">{team.presentation_order}</span>
                <span className="presentation-team">{team.name}</span>
                <span className="presentation-time">
                  {team.presentation_starts_at && team.presentation_ends_at
                    ? `${formatTime(team.presentation_starts_at)} – ${formatTime(team.presentation_ends_at)}`
                    : '–'}
                </span>
                {isCurrent && <span className="presentation-badge">발표 중</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
