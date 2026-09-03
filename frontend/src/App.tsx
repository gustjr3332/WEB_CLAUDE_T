import { useEffect, useState } from 'react';
import { fetchContests, fetchMe, getStoredUsername, logout } from './api';
import { AuthPanel } from './AuthPanel';
import { ContestDetail } from './ContestDetail';
import { STATUS_LABEL } from './labels';
import type { Contest } from './types';

export default function App() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selected, setSelected] = useState<Contest | null>(null);
  const [status, setStatus] = useState('불러오는 중…');
  const [username, setUsername] = useState<string | null>(getStoredUsername());
  const [isOrganizer, setIsOrganizer] = useState(false);

  useEffect(() => {
    fetchContests()
      .then((data) => {
        setContests(data);
        setStatus('');
      })
      .catch((err: Error) => setStatus(err.message));
  }, []);

  useEffect(() => {
    if (!username) {
      setIsOrganizer(false);
      return;
    }
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setIsOrganizer(me.is_staff);
      })
      .catch(() => {
        if (!cancelled) setIsOrganizer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

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
          <ContestDetail
            contest={selected}
            username={username}
            isOrganizer={isOrganizer}
            onBack={() => setSelected(null)}
          />
        ) : (
          <section className="contest-list">
            {contests.map((contest) => (
              <article
                key={contest.slug}
                className={`contest-card status-${contest.status}`}
                onClick={() => setSelected(contest)}
              >
                <div className="contest-card-main">
                  <h2>{contest.name}</h2>
                  <p className="contest-meta">
                    <span>
                      {contest.start_at.slice(0, 10)} – {contest.end_at.slice(0, 10)}
                    </span>
                    <span>{contest.team_count}팀</span>
                  </p>
                </div>
                <span className={`status-badge status-${contest.status}`}>
                  {STATUS_LABEL[contest.status]}
                </span>
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
