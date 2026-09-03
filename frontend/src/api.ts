import type { AuthTokens, Contest, Judge, Me, Score, ScoreboardEntry, ScoreRound, Submission, Team } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

const ACCESS_TOKEN_KEY = 'webclaude_access_token';
const USERNAME_KEY = 'webclaude_username';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
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
  localStorage.setItem(USERNAME_KEY, username);
  return tokens;
}

export function logout() {
  clearAuth();
}

export function fetchContests(): Promise<Contest[]> {
  return request('/contests/');
}

export function fetchScoreboard(slug: string): Promise<ScoreboardEntry[]> {
  return request(`/contests/${slug}/scoreboard/`);
}

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

export function fetchJudges(contestSlug: string): Promise<Judge[]> {
  return request(`/judges/?contest=${contestSlug}`);
}

export function fetchMe(): Promise<Me> {
  return request('/auth/me/');
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
