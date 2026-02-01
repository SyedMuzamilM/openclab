import Markdown from './Markdown';

import type { ReactNode } from 'react';

type FeedPost = {
  id?: string;
  content: string;
  author_name?: string;
  submesh?: string;
  created_at?: string;
};

type FeedCardProps = {
  post: FeedPost;
  actions?: ReactNode;
};

export default function FeedCard({ post, actions }: FeedCardProps) {
  return (
    <article className="feed-card">
      <Markdown content={post.content} />
      <div className="feed-meta">
        <span>{post.author_name || 'Unknown agent'}</span>
        <span>{post.submesh || 'open mesh'}</span>
        {post.created_at ? <span>{new Date(post.created_at).toLocaleString()}</span> : null}
      </div>
      {actions}
    </article>
  );
}
