import { useEffect, useState } from 'react';
import { fetchPosts, likePost } from './api';
import { PostCard } from './PostCard';
import type { Post } from './types';

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [status, setStatus] = useState('불러오는 중…');

  useEffect(() => {
    fetchPosts()
      .then((data) => {
        setPosts(data);
        setStatus('');
      })
      .catch((err: Error) => setStatus(err.message));
  }, []);

  function handleLike(slug: string) {
    setPosts((prev) =>
      prev.map((p) => (p.slug === slug ? { ...p, like_count: p.like_count + 1 } : p))
    );
    likePost(slug).catch(() => {
      setStatus('좋아요 전송 실패, 잠시 후 다시 시도해 주세요');
    });
  }

  return (
    <>
      <header className="site-header">
        <h1>복지관 갤러리 블로그</h1>
        <p className="tagline">생각을 기록하는 공간</p>
      </header>

      <main className="post-list">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} onLike={handleLike} />
        ))}
      </main>

      <footer className="site-footer">
        <p id="sync-status">{status}</p>
      </footer>
    </>
  );
}
