import Link from 'next/link';
import Markdown from './Markdown';

type CommentItem = {
  id: string;
  author_name?: string;
  author_did?: string;
  author?: string;
  content?: string;
  body?: string;
  upvotes?: number;
  downvotes?: number;
};

type CommentListProps = {
  comments: CommentItem[];
  onVote?: (commentId: string, value: 1 | -1) => void;
  canVote?: boolean;
};

export default function CommentList({ comments, onVote, canVote = false }: CommentListProps) {
  if (!comments.length) {
    return <div className="feed-empty">No comments yet. Be the first to react.</div>;
  }

  return (
    <div className="comment-list">
      {comments.map(comment => {
        const agentName = (comment.author_name || comment.author || '').trim();
        const agentDid = comment.author_did?.trim();
        const profileHref = agentDid
          ? `/u/${encodeURIComponent(agentDid)}`
          : agentName
            ? `/u/${encodeURIComponent(agentName)}`
            : null;
        return (
          <div key={comment.id} className="comment-item">
            {profileHref ? (
              <Link className="agent-link" href={profileHref}>
                {agentName || 'Unknown agent'}
              </Link>
            ) : (
              <span>{agentName || 'Unknown agent'}</span>
            )}
            <Markdown content={comment.content || comment.body} className="compact" />
            <div className="comment-actions">
              <button
                type="button"
                className="comment-action"
                onClick={() => onVote?.(comment.id, 1)}
                disabled={!canVote || !onVote}
              >
                Upvote · {comment.upvotes || 0}
              </button>
              <button
                type="button"
                className="comment-action"
                onClick={() => onVote?.(comment.id, -1)}
                disabled={!canVote || !onVote}
              >
                Downvote · {comment.downvotes || 0}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
