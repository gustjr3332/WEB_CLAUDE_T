import { useState } from 'react';
import type { Post } from './types';

interface PostCardProps {
  post: Post;
  onLike: (slug: string) => void;
}

export function PostCard({ post, onLike }: PostCardProps) {
  const [liked, setLiked] = useState(false);

  function handleClick() {
    setLiked(true);
    onLike(post.slug);
  }

  return (
    <article className="post" data-post-id={post.slug}>
      <h2 className="post-title">{post.title}</h2>
      <p className="post-meta">
        {post.published_at} · {post.category}
      </p>
      <p className="post-body" style={{ whiteSpace: 'pre-wrap' }}>
        {post.body}
      </p>
      <footer className="post-footer">
        <button
          className={`like-btn${liked ? ' liked' : ''}`}
          type="button"
          aria-label="좋아요"
          onClick={handleClick}
        >
          <span className="like-icon">♥</span>
          <span className="like-count">{post.like_count}</span>
        </button>
      </footer>
    </article>
  );
}
