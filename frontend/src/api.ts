import type {
  AuthTokens,
  Contest,
  ContestInput,
  ContestStatus,
  Judge,
  Me,
  Score,
  ScoreboardEntry,
  ScoreRound,
  Submission,
  Team,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const ACCESS_TOKEN_KEY = 'webclaude_access_token';
const REFRESH_TOKEN_KEY = 'webclaude_refresh_token';
const USERNAME_KEY = 'webclaude_username';

/** 리프레시까지 실패해 세션이 끝났을 때 window 에 발생시키는 이벤트 이름. */
export const AUTH_EXPIRED_EVENT = 'webclaude:auth-expired';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

// 동시에 여러 요청이 401 을 받아도 리프레시는 한 번만 보낸다.
let refreshInFlight: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return Promise.resolve(false);

  refreshInFlight = fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = (await res.json()) as { access: string; refresh?: string };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
      if (data.refresh) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestInit = {}, allowRefresh = true): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && token && allowRefresh) {
    if (await refreshAccessToken()) {
      return request<T>(path, options, false);
    }
    clearAuth();
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message =
      (detail && (detail.detail || Object.values(detail)[0])) || `요청에 실패했습니다 (${res.status})`;
    throw new Error(Array.isArray(message) ? message[0] : String(message));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function register(username: string, email: string, password: string): Promise<void> {
  await request('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export async function login(username: string, password: string): Promise<AuthTokens> {
  const tokens = await request<AuthTokens>('/auth/token/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
  localStorage.setItem(USERNAME_KEY, username);
  return tokens;
}

export function logout() {
  clearAuth();
}

export function fetchMe(): Promise<Me> {
  return request('/auth/me/');
}

// ---------- contests ----------

export function fetchContests(): Promise<Contest[]> {
  return request('/contests/');
}

export function fetchContest(slug: string): Promise<Contest> {
  return request(`/contests/${slug}/`);
}

export function createContest(data: ContestInput): Promise<Contest> {
  return request('/contests/', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateContest(
  slug: string,
  data: Partial<ContestInput> & { status?: ContestStatus }
): Promise<Contest> {
  return request(`/contests/${slug}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function fetchScoreboard(slug: string): Promise<ScoreboardEntry[]> {
  return request(`/contests/${slug}/scoreboard/`);
}

// ---------- teams ----------

export function fetchTeams(contestSlug: string): Promise<Team[]> {
  return request(`/teams/?contest=${contestSlug}`);
}

export function createTeam(contestSlug: string, name: string): Promise<Team> {
  return request('/teams/', {
    method: 'POST',
    body: JSON.stringify({ contest: contestSlug, name }),
  });
}

export function joinTeam(teamId: number): Promise<void> {
  return request(`/teams/${teamId}/join/`, { method: 'POST' });
}

// ---------- judges ----------

export function fetchJudges(contestSlug: string): Promise<Judge[]> {
  return request(`/judges/?contest=${contestSlug}`);
}

export function addJudge(contestSlug: string, username: string): Promise<Judge> {
  return request('/judges/', {
    method: 'POST',
    body: JSON.stringify({ contest: contestSlug, user_username: username }),
  });
}

export function removeJudge(judgeId: number): Promise<void> {
  return request(`/judges/${judgeId}/`, { method: 'DELETE' });
}

// ---------- scores ----------

export function fetchMyScores(): Promise<Score[]> {
  return request('/scores/');
}

export function upsertScore(
  submissionId: number,
  round: ScoreRound,
  existingId: number | undefined,
  data: { value: string; comment: string }
): Promise<Score> {
  if (existingId) {
    return request(`/scores/${existingId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  return request('/scores/', {
    method: 'POST',
    body: JSON.stringify({ submission: submissionId, round, ...data }),
  });
}

// ---------- submissions ----------

export function upsertSubmission(
  teamId: number,
  existingId: number | undefined,
  data: { title: string; description: string; link_url: string }
): Promise<Submission> {
  if (existingId) {
    return request(`/submissions/${existingId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
  return request('/submissions/', {
    method: 'POST',
    body: JSON.stringify({ team: teamId, ...data }),
  });
}
