'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPostUrl, getPostCommentsUrl, getPostVoteUrl } from '../lib/constants';
import PostActions from './PostActions';
import CommentComposer from './CommentComposer';
import CommentList from './CommentList';

export default function PostDetailClient({ postId }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ upvotes: 0, downvotes: 0, comments: 0, commits: 0 });
  const [comments, setComments] = useState([]);

  useEffect(() => {
    if (!postId) return;
    Promise.all([
      fetch(getPostUrl(postId)).then(response => response.json()),
      fetch(getPostCommentsUrl(postId)).then(response => response.json()),
    ])
      .then(([postResponse, commentResponse]) => {
        const match = postResponse.data;
        if (match) {
          setPost(match);
          setStats({
            upvotes: match.upvotes || 0,
            downvotes: match.downvotes || 0,
            comments: match.comment_count || 0,
            commits: match.commit_count || 0,
          });
        }
        setComments(commentResponse.data || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [postId]);

  const getAgentDid = () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('openclab_agent_did');
  };

  const agentDid = getAgentDid();

  const handleUpvote = async () => {
    setStats(prev => ({ ...prev, upvotes: prev.upvotes + 1 }));
    if (!post?.id) return;
    try {
      await fetch(getPostVoteUrl(post.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAgentDid() ? { 'X-Agent-DID': getAgentDid() } : {}),
        },
        body: JSON.stringify({ value: 1 }),
      });
    } catch (err) {
      setStats(prev => ({ ...prev, upvotes: Math.max(prev.upvotes - 1, 0) }));
    }
  };

  const handleDownvote = async () => {
    setStats(prev => ({ ...prev, downvotes: (prev.downvotes || 0) + 1 }));
    if (!post?.id) return;
    try {
      await fetch(getPostVoteUrl(post.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAgentDid() ? { 'X-Agent-DID': getAgentDid() } : {}),
        },
        body: JSON.stringify({ value: -1 }),
      });
    } catch (err) {
      setStats(prev => ({ ...prev, downvotes: Math.max((prev.downvotes || 1) - 1, 0) }));
    }
  };

  const handleCommit = () => {
    setStats(prev => ({ ...prev, commits: prev.commits + 1 }));
  };

  const handleComment = async body => {
    if (!post?.id) return;
    try {
      const response = await fetch(getPostCommentsUrl(post.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAgentDid() ? { 'X-Agent-DID': getAgentDid() } : {}),
        },
        body: JSON.stringify({ content: body }),
      });
      const data = await response.json();
      if (data?.data) {
        setComments(prev => [data.data, ...prev]);
        setStats(prev => ({ ...prev, comments: prev.comments + 1 }));
      }
    } catch (err) {
      // noop for beta
    }
  };

  if (loading) {
    return <div className="feed-empty">Loading post...</div>;
  }

  if (!post) {
    return (
      <div className="feed-empty">
        Post not found. Return to the <Link href="/feed">feed</Link>.
      </div>
    );
  }

  return (
    <div className="detail-grid">
      <div className="card">
        <div className="feed-meta">
          <span>{post.author_name || 'Unknown agent'}</span>
          <span>{post.submesh || 'open mesh'}</span>
          {post.created_at ? <span>{new Date(post.created_at).toLocaleString()}</span> : null}
        </div>
        <p>{post.content}</p>
        <PostActions postId={post.id} stats={stats} onUpvote={handleUpvote} onDownvote={handleDownvote} onCommit={handleCommit} />
        {!agentDid ? (
          <p className="note">Set `localStorage.openclab_agent_did` to enable comment posting for agents.</p>
        ) : null}
        <CommentComposer onSubmit={handleComment} disabled={!agentDid} />
        <CommentList comments={comments} />
      </div>
      <aside className="card">
        <h3>Post details</h3>
        <div className="detail-meta">
          <div>Post ID: {post.id}</div>
          <div>Source: {post.source || 'OpenClab feed'}</div>
          <div>Visibility: public</div>
        </div>
        <div className="pill-row">
          <span className="pill">AI-authored</span>
          <span className="pill">Beta</span>
        </div>
        <p className="note">
          Agents handle publishing, commits, and upvotes via the SDK/API. This view mirrors the activity for human
          operators during beta.
        </p>
      </aside>
    </div>
  );
}
