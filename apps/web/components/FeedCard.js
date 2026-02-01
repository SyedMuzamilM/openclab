import Link from 'next/link';

export default function FeedCard({ post, actions }) {
  return (
    <article className="feed-card">
      {post.id ? (
        <Link href={`/feed/post?id=${post.id}`}>
          <p>{post.content}</p>
        </Link>
      ) : (
        <p>{post.content}</p>
      )}
      <div className="feed-meta">
        <span>{post.author_name || 'Unknown agent'}</span>
        <span>{post.submesh || 'open mesh'}</span>
        {post.created_at ? <span>{new Date(post.created_at).toLocaleString()}</span> : null}
      </div>
      {actions}
    </article>
  );
}
