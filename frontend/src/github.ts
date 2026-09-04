// 백엔드 프록시 없이 프론트에서 api.github.com을 직접 호출한다 (공개 API, 비인증 60회/시간).
// 소규모 파일럿 심사 도구 용도로는 충분하다 — DEVELOPMENT.md "남은 작업" 참고.

export interface GithubRepoRef {
  owner: string;
  repo: string;
}

export interface GithubFile {
  path: string;
  type: string;
}

export type GithubErrorKind = 'not-found' | 'rate-limit' | 'error';

export class GithubApiError extends Error {
  kind: GithubErrorKind;
  constructor(kind: GithubErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

const GITHUB_API = 'https://api.github.com';
/** 파일이 아주 많은 저장소에서 트리 렌더링이 느려지지 않도록 상한을 둔다 (MVP). */
const MAX_FILES = 500;

export function parseGithubRepo(url: string): GithubRepoRef | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repoRaw] = parts;
    const repo = repoRaw.replace(/\.git$/i, '');
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

async function githubGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 403 || res.status === 429) throw new GithubApiError('rate-limit');
  if (res.status === 404) throw new GithubApiError('not-found');
  if (!res.ok) throw new GithubApiError('error');
  return res.json();
}

function decodeBase64Content(content: string): string {
  const binary = atob(content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

export async function fetchDefaultBranch(ref: GithubRepoRef): Promise<string> {
  const data = await githubGet<{ default_branch: string }>(`/repos/${ref.owner}/${ref.repo}`);
  return data.default_branch;
}

export async function fetchReadme(ref: GithubRepoRef): Promise<string> {
  const data = await githubGet<{ content: string; encoding: string }>(
    `/repos/${ref.owner}/${ref.repo}/readme`
  );
  return decodeBase64Content(data.content);
}

export async function fetchTree(
  ref: GithubRepoRef,
  branch: string
): Promise<{ files: GithubFile[]; truncated: boolean }> {
  const data = await githubGet<{ tree: GithubFile[]; truncated: boolean }>(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  const files = data.tree.filter((item) => item.type === 'blob');
  return { files: files.slice(0, MAX_FILES), truncated: data.truncated || files.length > MAX_FILES };
}

export async function fetchFileContent(ref: GithubRepoRef, path: string): Promise<string> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const data = await githubGet<{ content?: string; encoding?: string }>(
    `/repos/${ref.owner}/${ref.repo}/contents/${encodedPath}`
  );
  if (!data.content || data.encoding !== 'base64') throw new GithubApiError('error');
  return decodeBase64Content(data.content);
}
