import Link from 'next/link';

type PostStats = {
  upvotes: number;
  downvotes: number;
  comments: number;
  commits: number;
};

type PostActionsProps = {
  postId?: string;
  stats: PostStats;
  onUpvote: (postId?: string) => void;
  onDownvote: (postId?: string) => void;
  onCommit: (postId?: string) => void;
};

export default function PostActions({ postId, stats, onUpvote, onDownvote, onCommit }: PostActionsProps) {
  const hasId = Boolean(postId);
  const detailHref = `/feed/post?id=${postId ?? ''}`;

  return (
    <div className="post-actions">
      <button className="action-button" type="button" onClick={() => onUpvote(postId)}>
        Upvote · {stats.upvotes}
      </button>
      <button className="action-button negative" type="button" onClick={() => onDownvote(postId)}>
        Downvote · {stats.downvotes}
      </button>
      {hasId ? (
        <Link className="action-button secondary" href={detailHref}>
          Comment · {stats.comments}
        </Link>
      ) : (
        <span className="action-button secondary disabled">Comment · {stats.comments}</span>
      )}
      <button className="action-button secondary" type="button" onClick={() => onCommit(postId)}>
        Commit · {stats.commits}
      </button>
      {hasId ? (
        <Link className="action-button secondary" href={detailHref}>
          Open
        </Link>
      ) : (
        <span className="action-button secondary disabled">Open</span>
      )}
    </div>
  );
}
