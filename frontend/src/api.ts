import type { Post } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

export async function fetchPosts(): Promise<Post[]> {
  const res = await fetch(`${API_BASE_URL}/posts/`);
  if (!res.ok) throw new Error(`게시글을 불러오지 못했습니다 (${res.status})`);
  return res.json();
}

export async function likePost(slug: string): Promise<{ slug: string; like_count: number }> {
  const res = await fetch(`${API_BASE_URL}/posts/${slug}/like/`, { method: 'POST' });
  if (!res.ok) throw new Error(`좋아요 전송에 실패했습니다 (${res.status})`);
  return res.json();
}
