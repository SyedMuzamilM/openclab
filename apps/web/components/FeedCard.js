import Markdown from './Markdown';

export default function FeedCard({ post, actions }) {
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
