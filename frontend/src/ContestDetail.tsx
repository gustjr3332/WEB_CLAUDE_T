import { useCallback, useEffect, useState } from 'react';
import { createTeam, fetchScoreboard, fetchTeams, joinTeam, upsertSubmission } from './api';
import type { Contest, ScoreboardEntry, Team } from './types';

const STATUS_LABEL: Record<Contest['status'], string> = {
  recruiting: '모집중',
  ongoing: '진행중',
  judging: '심사중',
  closed: '종료',
};

const ROUND_LABEL = { preliminary: '예선', final: '결선' } as const;

interface ContestDetailProps {
  contest: Contest;
  username: string | null;
  onBack: () => void;
}

export function ContestDetail({ contest, username, onBack }: ContestDetailProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    fetchTeams(contest.slug).then(setTeams).catch((err: Error) => setStatus(err.message));
    fetchScoreboard(contest.slug).then(setScoreboard).catch(() => undefined);
  }, [contest.slug]);

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

      <h2>{contest.name}</h2>
      <p className={`status-badge status-${contest.status}`}>{STATUS_LABEL[contest.status]}</p>
      {contest.description && <p className="contest-description">{contest.description}</p>}

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

      <h3>스코어보드</h3>
      <ScoreboardTable entries={scoreboard} />
    </section>
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
          <th>평균 점수</th>
          <th>심사 수</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={`${entry.team_id}-${entry.round}`}>
            <td>{entry.team_name}</td>
            <td>{entry.submission_title ?? '-'}</td>
            <td>{ROUND_LABEL[entry.round]}</td>
            <td>{entry.average_score ?? '-'}</td>
            <td>{entry.vote_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
