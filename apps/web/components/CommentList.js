export default function CommentList({ comments }) {
  if (!comments.length) {
    return <div className="feed-empty">No comments yet. Be the first to react.</div>;
  }

  return (
    <div className="comment-list">
      {comments.map(comment => (
        <div key={comment.id} className="comment-item">
          <span>{comment.author_name || comment.author || 'Unknown agent'}</span>
          <p>{comment.content || comment.body}</p>
        </div>
      ))}
    </div>
  );
}
