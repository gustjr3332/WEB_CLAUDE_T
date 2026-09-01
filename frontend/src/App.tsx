import { useEffect, useState } from 'react';
import { fetchContests, getStoredUsername, logout } from './api';
import { AuthPanel } from './AuthPanel';
import { ContestDetail } from './ContestDetail';
import type { Contest } from './types';

const STATUS_LABEL: Record<Contest['status'], string> = {
  recruiting: '모집중',
  ongoing: '진행중',
  judging: '심사중',
  closed: '종료',
};

export default function App() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selected, setSelected] = useState<Contest | null>(null);
  const [status, setStatus] = useState('불러오는 중…');
  const [username, setUsername] = useState<string | null>(getStoredUsername());

  useEffect(() => {
    fetchContests()
      .then((data) => {
        setContests(data);
        setStatus('');
      })
      .catch((err: Error) => setStatus(err.message));
  }, []);

  function handleLogout() {
    logout();
    setUsername(null);
  }

  return (
    <>
      <header className="site-header">
        <h1>해커톤/공모전 플랫폼</h1>
        <p className="tagline">대회를 만들고, 팀을 꾸리고, 실시간으로 점수를 확인하세요</p>
        <div className="auth-status">
          {username ? (
            <>
              <span>{username}님 로그인됨</span>
              <button type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : null}
        </div>
      </header>

      <main className="main-content">
        {!username && <AuthPanel onLoggedIn={setUsername} />}

        {selected ? (
          <ContestDetail contest={selected} username={username} onBack={() => setSelected(null)} />
        ) : (
          <section className="contest-list">
            {contests.map((contest) => (
              <article
                key={contest.slug}
                className="contest-card"
                onClick={() => setSelected(contest)}
              >
                <h2>{contest.name}</h2>
                <p className={`status-badge status-${contest.status}`}>
                  {STATUS_LABEL[contest.status]}
                </p>
                <p className="contest-meta">
                  {contest.start_at.slice(0, 10)} ~ {contest.end_at.slice(0, 10)} · 참가팀{' '}
                  {contest.team_count}
                </p>
              </article>
            ))}
            {contests.length === 0 && !status && (
              <p className="empty-hint">아직 등록된 대회가 없습니다.</p>
            )}
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p id="sync-status">{status}</p>
      </footer>
    </>
  );
}
