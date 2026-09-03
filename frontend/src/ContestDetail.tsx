import { useCallback, useEffect, useState } from 'react';
import {
  addJudge,
  createTeam,
  fetchJudges,
  fetchMyScores,
  fetchScoreboard,
  fetchTeams,
  joinTeam,
  removeJudge,
  upsertScore,
  upsertSubmission,
} from './api';
import { ROUND_LABEL, ROUNDS, STATUS_LABEL } from './labels';
import type { Contest, Judge, Score, ScoreboardEntry, ScoreRound, Team } from './types';

interface ContestDetailProps {
  contest: Contest;
  username: string | null;
  isOrganizer: boolean;
  onBack: () => void;
}

export function ContestDetail({ contest, username, isOrganizer, onBack }: ContestDetailProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [status, setStatus] = useState('');
  const [judges, setJudges] = useState<Judge[]>([]);
  const [myScores, setMyScores] = useState<Score[]>([]);
  const isJudge = judges.some((j) => j.username === username);

  const load = useCallback(() => {
    fetchTeams(contest.slug).then(setTeams).catch((err: Error) => setStatus(err.message));
    fetchScoreboard(contest.slug).then(setScoreboard).catch(() => undefined);
    if (username) {
      fetchJudges(contest.slug).then(setJudges).catch(() => setJudges([]));
      fetchMyScores().then(setMyScores).catch(() => undefined);
    } else {
      setJudges([]);
    }
  }, [contest.slug, username]);

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <section className="contest-detail">
      <button className="back-btn" type="button" onClick={onBack}>
        ← 목록으로
      </button>

      <div className="detail-header">
        <h2>{contest.name}</h2>
        <span className={`status-badge status-${contest.status}`}>
          {STATUS_LABEL[contest.status]}
        </span>
        {contest.description && <p className="contest-description">{contest.description}</p>}
      </div>

      <div className="scoreboard-hero">
        <h3 className="section-heading">스코어보드</h3>
        <ScoreboardTable entries={scoreboard} />
      </div>

      {username && (
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

      {status && <p className="form-error">{status}</p>}

      <div>
        <h3 className="section-heading">팀</h3>
        <div className="team-list">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              username={username}
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
          <JudgePanel teams={teams} myScores={myScores} onScored={load} />
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

interface JudgePanelProps {
  teams: Team[];
  myScores: Score[];
  onScored: () => void;
}

function JudgePanel({ teams, myScores, onScored }: JudgePanelProps) {
  const judgeable = teams.filter((team) => team.submission);
  if (judgeable.length === 0) {
    return <p className="empty-hint">채점할 제출물이 아직 없습니다.</p>;
  }
  return (
    <div className="judge-panel">
      {judgeable.map((team) => (
        <article key={team.id} className="judge-card">
          <h4>{team.name}</h4>
          <p className="submission-summary">{team.submission!.title}</p>
          <div className="score-rounds">
            {ROUNDS.map((round) => (
              <ScoreForm
                key={round}
                round={round}
                submissionId={team.submission!.id}
                existing={myScores.find(
                  (s) => s.submission === team.submission!.id && s.round === round
                )}
                onScored={onScored}
              />
            ))}
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
  onScored: () => void;
}

function ScoreForm({ round, submissionId, existing, onScored }: ScoreFormProps) {
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
    <form className="score-form" onSubmit={handleSubmit}>
      <label className="score-round-label">{ROUND_LABEL[round]}</label>
      <input
        type="number"
        min={0}
        max={100}
        step="0.5"
        placeholder="점수"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
      />
      <textarea
        placeholder="코멘트 (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy}>
        {existing ? '점수 수정' : '점수 저장'}
      </button>
    </form>
  );
}

interface TeamCardProps {
  team: Team;
  username: string | null;
  onJoin: () => void;
  onSubmissionSaved: () => void;
}

function TeamCard({ team, username, onJoin, onSubmissionSaved }: TeamCardProps) {
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

  return (
    <article className="team-card">
      <header>
        <h4>{team.name}</h4>
        {!isMine && username && (
          <button type="button" onClick={onJoin}>
            참가하기
          </button>
        )}
      </header>
      <p className="team-members">
        참가자: {team.participants.map((p) => p.username).join(', ') || '없음'}
      </p>

      {isMine ? (
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
      ) : team.submission ? (
        <p className="submission-summary">제출물: {team.submission.title}</p>
      ) : (
        <p className="submission-summary empty-hint">아직 제출물이 없습니다.</p>
      )}
    </article>
  );
}

function ScoreboardTable({ entries }: { entries: ScoreboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="empty-hint">아직 집계된 점수가 없습니다.</p>;
  }
  return (
    <table className="scoreboard-table">
      <thead>
        <tr>
          <th>팀</th>
          <th>제출물</th>
          <th>라운드</th>
          <th className="num">평균 점수</th>
          <th className="num">심사 수</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={`${entry.team_id}-${entry.round}`}>
            <td>{entry.team_name}</td>
            <td>{entry.submission_title ?? '-'}</td>
            <td>{ROUND_LABEL[entry.round]}</td>
            <td className="score">
              {entry.average_score == null ? '-' : Number(entry.average_score).toFixed(2)}
            </td>
            <td className="num">{entry.vote_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
