import { useState } from 'react';
import { login, register } from './api';

interface AuthPanelProps {
  onLoggedIn: (username: string) => void;
}

export function AuthPanel({ onLoggedIn }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(username, email, password);
      }
      await login(username, password);
      onLoggedIn(username);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-panel" onSubmit={handleSubmit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={mode === 'login' ? 'active' : ''}
          onClick={() => setMode('login')}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => setMode('register')}
        >
          회원가입
        </button>
      </div>

      <input
        type="text"
        placeholder="아이디"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      {mode === 'register' && (
        <input
          type="email"
          placeholder="이메일 (선택)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      )}
      <input
        type="password"
        placeholder="비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={busy}>
        {mode === 'login' ? '로그인' : '가입하고 시작하기'}
      </button>
    </form>
  );
}
