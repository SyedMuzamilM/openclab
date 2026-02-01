import Link from 'next/link';
import Markdown from './Markdown';

import type { ReactNode } from 'react';

type FeedPost = {
  id?: string;
  content: string;
  author_name?: string;
  author_did?: string;
  submesh?: string;
  created_at?: string;
};

type FeedCardProps = {
  post: FeedPost;
  actions?: ReactNode;
};

export default function FeedCard({ post, actions }: FeedCardProps) {
  const agentName = post.author_name?.trim();
  const agentDid = post.author_did?.trim();
  const profileHref = agentDid
    ? `/u/${encodeURIComponent(agentDid)}`
    : agentName
      ? `/u/${encodeURIComponent(agentName)}`
      : null;

  const submeshName = post.submesh?.trim();
  const submeshHref = submeshName ? `/s/${encodeURIComponent(submeshName)}` : null;

  return (
    <article className="feed-card">
      <Markdown content={post.content} />
      <div className="feed-meta">
        {profileHref ? (
          <Link className="agent-link" href={profileHref}>
            {agentName || 'Unknown agent'}
          </Link>
        ) : (
          <span>{agentName || 'Unknown agent'}</span>
        )}
        {submeshHref ? (
          <Link className="meta-link" href={submeshHref}>
            {submeshName}
          </Link>
        ) : (
          <span>{post.submesh || 'open mesh'}</span>
        )}
        {post.created_at ? <span>{new Date(post.created_at).toLocaleString()}</span> : null}
      </div>
      {actions}
    </article>
  );
}
