import { useCallback, useEffect, useState } from 'react';
import { AUTH_EXPIRED_EVENT, fetchContests, fetchMe, getStoredUsername, logout } from './api';
import { AuthPanel } from './AuthPanel';
import { ContestDetail } from './ContestDetail';
import { ContestForm } from './ContestForm';
import { STATUS_LABEL } from './labels';
import type { Contest } from './types';

export default function App() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [status, setStatus] = useState('불러오는 중…');
  const [username, setUsername] = useState<string | null>(getStoredUsername());
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // 상세 화면은 항상 최신 목록의 대회 객체를 본다 (상태 전이 후에도 동기화 유지).
  const selected = contests.find((c) => c.slug === selectedSlug) ?? null;

  const loadContests = useCallback(() => {
    return fetchContests()
      .then((data) => {
        setContests(data);
        setStatus('');
      })
      .catch((err: Error) => setStatus(err.message));
  }, []);

  useEffect(() => {
    loadContests();
  }, [loadContests]);

  useEffect(() => {
    const handleExpired = () => {
      setUsername(null);
      setStatus('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  useEffect(() => {
    if (!username) {
      setIsOrganizer(false);
      setShowCreateForm(false);
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
    setStatus('');
  }

  function handleLoggedIn(name: string) {
    setUsername(name);
    setStatus('');
  }

  // ContestDetail 의 폴링 콜백으로도 쓰이므로 참조가 안정적이어야 한다 (useCallback).
  // 내용이 같으면 이전 배열을 그대로 돌려 불필요한 재렌더를 막는다.
  const handleContestUpdated = useCallback((updated: Contest) => {
    setContests((prev) => {
      const current = prev.find((c) => c.slug === updated.slug);
      if (
        current &&
        current.updated_at === updated.updated_at &&
        current.team_count === updated.team_count
      ) {
        return prev;
      }
      return prev.map((c) => (c.slug === updated.slug ? updated : c));
    });
  }, []);

  function handleContestCreated(created: Contest) {
    setContests((prev) => [created, ...prev.filter((c) => c.slug !== created.slug)]);
    setShowCreateForm(false);
    setSelectedSlug(created.slug);
    loadContests();
  }

  return (
    <>
      <header className="site-header">
        <h1>해커톤/공모전 플랫폼</h1>
        <p className="tagline">대회를 만들고, 팀을 꾸리고, 실시간으로 점수를 확인하세요</p>
        <div className="auth-status">
          {username ? (
            <>
              <span>
                {username}님 로그인됨
                {isOrganizer && <span className="role-tag">운영자</span>}
              </span>
              <button type="button" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : null}
        </div>
      </header>

      <main className="main-content">
        {!username && <AuthPanel onLoggedIn={handleLoggedIn} />}

        {selected ? (
          <ContestDetail
            contest={selected}
            username={username}
            isOrganizer={isOrganizer}
            onBack={() => setSelectedSlug(null)}
            onContestUpdated={handleContestUpdated}
          />
        ) : (
          <>
            {isOrganizer && !showCreateForm && (
              <div className="organizer-bar">
                <button type="button" onClick={() => setShowCreateForm(true)}>
                  + 새 대회 만들기
                </button>
              </div>
            )}
            {isOrganizer && showCreateForm && (
              <ContestForm
                onCreated={handleContestCreated}
                onCancel={() => setShowCreateForm(false)}
              />
            )}

            <section className="contest-list">
              {contests.map((contest) => (
                <article
                  key={contest.slug}
                  className={`contest-card status-${contest.status}`}
                  onClick={() => setSelectedSlug(contest.slug)}
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
          </>
        )}
      </main>

      <footer className="site-footer">
        <p id="sync-status">{status}</p>
      </footer>
    </>
  );
}
