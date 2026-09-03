import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  addJudge,
  createTeam,
  fetchContest,
  fetchJudges,
  fetchMyScores,
  fetchScoreboard,
  fetchTeams,
  joinTeam,
  removeJudge,
  updateContest,
  upsertScore,
  upsertSubmission,
} from './api';
import { ROUND_LABEL, ROUNDS, STATUS_HINT, STATUS_LABEL, STATUS_ORDER } from './labels';
import { canFormTeams, canScore, canSubmit, isLive } from './rules';
import type {
  Contest,
  ContestStatus,
  Judge,
  Score,
  ScoreboardEntry,
  ScoreRound,
  Team,
} from './types';

/** 스코어보드·팀 목록·대회 상태 폴링 주기. */
const POLL_INTERVAL_MS = 5000;
/** 종료된 대회는 상태가 다시 열리는지만 느리게 확인한다. */
const CLOSED_POLL_INTERVAL_MS = 30000;

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', DATE_FORMAT);
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('ko-KR', { hour12: false });
}

interface ContestDetailProps {
  contest: Contest;
  username: string | null;
  isOrganizer: boolean;
  onBack: () => void;
  onContestUpdated: (contest: Contest) => void;
}

export function ContestDetail({
  contest,
  username,
  isOrganizer,
  onBack,
  onContestUpdated,
}: ContestDetailProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([]);
  const [round, setRound] = useState<ScoreRound>('preliminary');
  const [newTeamName, setNewTeamName] = useState('');
  const [status, setStatus] = useState('');
  const [judges, setJudges] = useState<Judge[]>([]);
  const [myScores, setMyScores] = useState<Score[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveError, setLiveError] = useState(false);

  const isJudge = judges.some((j) => j.username === username);
  const polling = isLive(contest.status);

  // 실시간으로 바뀌는 데이터(팀, 스코어보드, 대회 상태)를 주기적으로 다시 가져온다.
  // 운영자가 다른 화면에서 상태를 바꾸면 참가자·심사위원 화면도 다음 폴링에서 따라간다.
  const refreshLive = useCallback(() => {
    return Promise.all([
      fetchTeams(contest.slug),
      fetchScoreboard(contest.slug),
      fetchContest(contest.slug),
    ])
      .then(([teamData, boardData, freshContest]) => {
        setTeams(teamData);
        setScoreboard(boardData);
        setLastUpdated(new Date());
        setLiveError(false);
        onContestUpdated(freshContest);
      })
      .catch(() => setLiveError(true));
  }, [contest.slug, onContestUpdated]);

  const loadUserData = useCallback(() => {
    if (!username) {
      setJudges([]);
      setMyScores([]);
      return;
    }
    fetchJudges(contest.slug).then(setJudges).catch(() => setJudges([]));
    fetchMyScores().then(setMyScores).catch(() => undefined);
  }, [contest.slug, username]);

  const load = useCallback(() => {
    refreshLive();
    loadUserData();
  }, [refreshLive, loadUserData]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') refreshLive();
    };
    // 종료된 대회는 순위가 더 바뀌지 않으므로 상태 재개 감지용으로만 느리게 확인한다.
    const timer = window.setInterval(tick, polling ? POLL_INTERVAL_MS : CLOSED_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [polling, refreshLive]);

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setStatus('');
    try {
      await createTeam(contest.slug, newTeamName);
      setNewTeamName('');
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '팀 생성에 실패했습니다');
    }
  }

  async function handleJoin(teamId: number) {
    setStatus('');
    try {
      await joinTeam(teamId);
      load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '팀 참가에 실패했습니다');
    }
  }

  const visibleEntries = scoreboard.filter((entry) => entry.round === round);

  return (
    <section className="contest-detail">
      <button className="back-btn" type="button" onClick={onBack}>
        ← 목록으로
      </button>

      <div className="detail-header">
        <div className="detail-header-row">
          <h2>{contest.name}</h2>
          <span className={`status-badge status-${contest.status}`}>
            {STATUS_LABEL[contest.status]}
          </span>
        </div>
        <p className="detail-dates">
          {formatDateTime(contest.start_at)} – {formatDateTime(contest.end_at)}
        </p>
        {contest.description && <p className="contest-description">{contest.description}</p>}
        {isOrganizer && <StatusControl contest={contest} onUpdated={onContestUpdated} />}
      </div>

      <div className="scoreboard-hero">
        <div className="scoreboard-head">
          <h3 className="section-heading">스코어보드</h3>
          <div className="seg-tabs" role="tablist" aria-label="라운드">
            {ROUNDS.map((r) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={round === r}
                className={round === r ? 'active' : ''}
                onClick={() => setRound(r)}
              >
                {ROUND_LABEL[r]}
              </button>
            ))}
          </div>
          <LiveIndicator polling={polling} error={liveError} lastUpdated={lastUpdated} />
        </div>
        <ScoreboardTable entries={visibleEntries} />
      </div>

      {username && canFormTeams(contest.status) && (
        <form className="team-form" onSubmit={handleCreateTeam}>
          <input
            type="text"
            placeholder="새 팀 이름"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            required
          />
          <button type="submit">팀 만들기</button>
        </form>
      )}
      {username && !canFormTeams(contest.status) && (
        <p className="lock-hint">
          팀 모집이 마감되었습니다 (현재 상태: {STATUS_LABEL[contest.status]}).
        </p>
      )}

      {status && <p className="form-error">{status}</p>}

      <div>
        <h3 className="section-heading">팀</h3>
        <div className="team-list">
          {teams.map((team) => (
            <TeamCard
              key={`${team.id}-${team.submission?.id ?? 'none'}`}
              team={team}
              username={username}
              contestStatus={contest.status}
              onJoin={() => handleJoin(team.id)}
              onSubmissionSaved={load}
            />
          ))}
          {teams.length === 0 && <p className="empty-hint">아직 등록된 팀이 없습니다.</p>}
        </div>
      </div>

      {isJudge && (
        <div>
          <h3 className="section-heading">심사하기</h3>
          {!canScore(contest.status) && (
            <p className="lock-hint">
              채점은 심사중 상태에서만 저장됩니다 (현재 상태: {STATUS_LABEL[contest.status]}).
            </p>
          )}
          <JudgePanel
            teams={teams}
            myScores={myScores}
            disabled={!canScore(contest.status)}
            onScored={load}
          />
        </div>
      )}

      {isOrganizer && (
        <div>
          <h3 className="section-heading">심사위원 배정</h3>
          <JudgeAssignPanel contestSlug={contest.slug} judges={judges} onChanged={load} />
        </div>
      )}
    </section>
  );
}

// ---------- status control (organizer only) ----------

interface StatusControlProps {
  contest: Contest;
  onUpdated: (contest: Contest) => void;
}

function StatusControl({ contest, onUpdated }: StatusControlProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function changeStatus(next: ContestStatus) {
    if (next === contest.status || busy) return;
    setError('');
    setBusy(true);
    try {
      const updated = await updateContest(contest.slug, { status: next });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태 변경에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="status-control-wrap">
      <div className="status-control" role="group" aria-label="대회 상태 전이">
        {STATUS_ORDER.map((s, index) => (
          <Fragment key={s}>
            {index > 0 && (
              <span className="arrow" aria-hidden="true">
                →
              </span>
            )}
            <button
              type="button"
              className={`status-${s}${s === contest.status ? ' active' : ''}`}
              aria-pressed={s === contest.status}
              disabled={busy}
              onClick={() => changeStatus(s)}
            >
              {STATUS_LABEL[s]}
            </button>
          </Fragment>
        ))}
      </div>
      <p className="status-hint">{STATUS_HINT[contest.status]}</p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

// ---------- live indicator ----------

interface LiveIndicatorProps {
  polling: boolean;
  error: boolean;
  lastUpdated: Date | null;
}

function LiveIndicator({ polling, error, lastUpdated }: LiveIndicatorProps) {
  const clock = lastUpdated ? formatClock(lastUpdated) : '--:--:--';
  if (!polling) {
    return <span className="live-indicator paused">최종 결과 · {clock}</span>;
  }
  if (error) {
    return <span className="live-indicator error">연결 끊김 · 재시도 중</span>;
  }
  return (
    <span className="live-indicator live">
      LIVE · {POLL_INTERVAL_MS / 1000}초마다 갱신 · {clock}
    </span>
  );
}

// ---------- judge assignment (organizer only) ----------

interface JudgeAssignPanelProps {
  contestSlug: string;
  judges: Judge[];
  onChanged: () => void;
}

function JudgeAssignPanel({ contestSlug, judges, onChanged }: JudgeAssignPanelProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await addJudge(contestSlug, username);
      setUsername('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '심사위원 배정에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(judgeId: number) {
    setError('');
    try {
      await removeJudge(judgeId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '심사위원 해제에 실패했습니다');
    }
  }

  return (
    <div className="judge-assign">
      <form className="team-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="심사위원으로 등록할 아이디"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          배정하기
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      <div className="judge-assign-list">
        {judges.map((judge) => (
          <div key={judge.id} className="judge-assign-row">
            <span>{judge.username}</span>
            <button type="button" onClick={() => handleRemove(judge.id)}>
              해제
            </button>
          </div>
        ))}
        {judges.length === 0 && <p className="empty-hint">배정된 심사위원이 없습니다.</p>}
      </div>
    </div>
  );
}

// ---------- judge scoring ----------

interface JudgePanelProps {
  teams: Team[];
  myScores: Score[];
  disabled: boolean;
  onScored: () => void;
}

function JudgePanel({ teams, myScores, disabled, onScored }: JudgePanelProps) {
  const judgeable = teams.filter((team) => team.submission);
  if (judgeable.length === 0) {
    return <p className="empty-hint">채점할 제출물이 아직 없습니다.</p>;
  }
  return (
    <div className="judge-panel">
      {judgeable.map((team) => (
        <article key={team.id} className="judge-card">
          <h4>{team.name}</h4>
          <p className="submission-summary">
            {team.submission!.title}
            {team.submission!.link_url && (
              <>
                {' · '}
                <a href={team.submission!.link_url} target="_blank" rel="noreferrer">
                  링크 열기
                </a>
              </>
            )}
          </p>
          <div className="score-rounds">
            {ROUNDS.map((r) => {
              const existing = myScores.find(
                (s) => s.submission === team.submission!.id && s.round === r
              );
              return (
                <ScoreForm
                  key={`${r}-${existing?.id ?? 'new'}`}
                  round={r}
                  submissionId={team.submission!.id}
                  existing={existing}
                  disabled={disabled}
                  onScored={onScored}
                />
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

interface ScoreFormProps {
  round: ScoreRound;
  submissionId: number;
  existing: Score | undefined;
  disabled: boolean;
  onScored: () => void;
}

function ScoreForm({ round, submissionId, existing, disabled, onScored }: ScoreFormProps) {
  const [value, setValue] = useState(existing?.value ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await upsertScore(submissionId, round, existing?.id, { value, comment });
      onScored();
    } catch (err) {
      setError(err instanceof Error ? err.message : '채점 저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`score-form${disabled ? ' disabled' : ''}`} onSubmit={handleSubmit}>
      <label className="score-round-label">
        {ROUND_LABEL[round]}
        {existing && (
          <span className="saved-at">
            저장됨{' '}
            {new Date(existing.updated_at).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
        )}
      </label>
      <input
        type="number"
        min={0}
        max={100}
        step="0.5"
        placeholder="점수"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        required
      />
      <textarea
        placeholder="코멘트 (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={disabled}
      />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy || disabled}>
        {existing ? '점수 수정' : '점수 저장'}
      </button>
    </form>
  );
}

// ---------- team card ----------

interface TeamCardProps {
  team: Team;
  username: string | null;
  contestStatus: ContestStatus;
  onJoin: () => void;
  onSubmissionSaved: () => void;
}

function TeamCard({ team, username, contestStatus, onJoin, onSubmissionSaved }: TeamCardProps) {
  const isMine = username != null && team.participants.some((p) => p.username === username);
  const [title, setTitle] = useState(team.submission?.title ?? '');
  const [description, setDescription] = useState(team.submission?.description ?? '');
  const [linkUrl, setLinkUrl] = useState(team.submission?.link_url ?? '');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await upsertSubmission(team.id, team.submission?.id, {
        title,
        description,
        link_url: linkUrl,
      });
      onSubmissionSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출에 실패했습니다');
    }
  }

  const submissionSummary = team.submission ? (
    <p className="submission-summary">
      제출물: {team.submission.title}
      {team.submission.link_url && (
        <>
          {' · '}
          <a href={team.submission.link_url} target="_blank" rel="noreferrer">
            링크
          </a>
        </>
      )}
    </p>
  ) : (
    <p className="submission-summary empty-hint">아직 제출물이 없습니다.</p>
  );

  return (
    <article className="team-card">
      <header>
        <h4>{team.name}</h4>
        {!isMine && username && canFormTeams(contestStatus) && (
          <button type="button" onClick={onJoin}>
            참가하기
          </button>
        )}
      </header>
      <p className="team-members">
        참가자: {team.participants.map((p) => p.username).join(', ') || '없음'}
      </p>

      {isMine && canSubmit(contestStatus) ? (
        <form className="submission-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="제출물 제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            type="url"
            placeholder="링크 (GitHub, 배포 URL 등)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          {error && <p className="form-error">{error}</p>}
          <button type="submit">{team.submission ? '제출물 수정' : '제출하기'}</button>
        </form>
      ) : (
        <>
          {submissionSummary}
          {isMine && (
            <p className="lock-hint">
              제출물이 잠겼습니다 (현재 상태: {STATUS_LABEL[contestStatus]}).
            </p>
          )}
        </>
      )}
    </article>
  );
}

// ---------- scoreboard ----------

function ScoreboardTable({ entries }: { entries: ScoreboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty-hint">아직 등록된 팀이 없습니다.</p>;
  }
  return (
    <div className="table-scroll">
      <table className="scoreboard-table">
        <thead>
          <tr>
            <th className="rank">순위</th>
            <th>팀</th>
            <th>제출물</th>
            <th className="num">평균 점수</th>
            <th className="num">심사 수</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.team_id} className={entry.rank === 1 ? 'rank-first' : ''}>
              <td className="rank">{entry.rank ?? '–'}</td>
              <td>{entry.team_name}</td>
              <td>{entry.submission_title ?? '–'}</td>
              <td className="score">
                {entry.average_score == null ? '–' : Number(entry.average_score).toFixed(2)}
              </td>
              <td className="num">{entry.vote_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
