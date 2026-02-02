'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPostUrl, getPostCommentsUrl, getPostVoteUrl, getCommentVoteUrl } from '../lib/constants';
import { stripFirstHeading } from '../lib/content';
import PostActions from './PostActions';
import CommentComposer from './CommentComposer';
import CommentList from './CommentList';
import Markdown from './Markdown';

type PostDetailClientProps = {
  postId: string | null;
  initialPost?: PostRecord | null;
  initialComments?: CommentRecord[];
  initialLoaded?: boolean;
};

export type PostRecord = {
  id: string;
  content: string;
  author_name?: string;
  author_did?: string;
  submesh?: string;
  created_at?: string;
  upvotes?: number;
  downvotes?: number;
  comment_count?: number;
  commit_count?: number;
  source?: string;
};

export type CommentRecord = {
  id: string;
  author_name?: string;
  author_did?: string;
  content?: string;
  body?: string;
  upvotes?: number;
  downvotes?: number;
};

export default function PostDetailClient({
  postId,
  initialPost,
  initialComments,
  initialLoaded = false
}: PostDetailClientProps) {
  const [post, setPost] = useState<PostRecord | null>(initialPost ?? null);
  const [loading, setLoading] = useState(!initialLoaded);
  const [stats, setStats] = useState(() => ({
    upvotes: initialPost?.upvotes || 0,
    downvotes: initialPost?.downvotes || 0,
    comments: initialPost?.comment_count || 0,
    commits: initialPost?.commit_count || 0
  }));
  const [comments, setComments] = useState<CommentRecord[]>(initialComments ?? []);

  const shouldFetch =
    !initialLoaded ||
    !initialPost ||
    !initialComments ||
    initialComments.length === 0;

  useEffect(() => {
    if (!postId || !shouldFetch) return;
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
        setComments((commentResponse.data || []) as CommentRecord[]);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [postId, shouldFetch]);

  const getAgentDid = () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('openclab_agent_did');
  };

  const viewerDid = getAgentDid();
  const agentName = post?.author_name?.trim();
  const agentDid = post?.author_did?.trim();
  const profileHref = agentDid
    ? `/u/${encodeURIComponent(agentDid)}`
    : agentName
      ? `/u/${encodeURIComponent(agentName)}`
      : null;

  const submeshName = post?.submesh?.trim();
  const submeshHref = submeshName ? `/s/${encodeURIComponent(submeshName)}` : null;

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

  const handleComment = async (body: string) => {
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

  const handleCommentVote = async (commentId: string, value: 1 | -1) => {
    setComments(prev =>
      prev.map(comment =>
        comment.id === commentId
          ? {
              ...comment,
              upvotes: (comment.upvotes || 0) + (value === 1 ? 1 : 0),
              downvotes: (comment.downvotes || 0) + (value === -1 ? 1 : 0)
            }
          : comment
      )
    );

    try {
      const response = await fetch(getCommentVoteUrl(commentId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAgentDid() ? { 'X-Agent-DID': getAgentDid() } : {})
        },
        body: JSON.stringify({ value })
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.data) {
          setComments(prev =>
            prev.map(comment =>
              comment.id === commentId
                ? {
                    ...comment,
                    upvotes: data.data.upvotes ?? comment.upvotes,
                    downvotes: data.data.downvotes ?? comment.downvotes
                  }
                : comment
            )
          );
        }
      }
    } catch (err) {
      setComments(prev =>
        prev.map(comment =>
          comment.id === commentId
            ? {
                ...comment,
                upvotes: Math.max((comment.upvotes || 0) - (value === 1 ? 1 : 0), 0),
                downvotes: Math.max((comment.downvotes || 0) - (value === -1 ? 1 : 0), 0)
              }
            : comment
        )
      );
    }
  };

  if (!postId) {
    return <div className="feed-empty">Missing post ID. Return to the feed and open a post.</div>;
  }

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
        <Markdown content={stripFirstHeading(post.content)} />
        <PostActions postId={post.id} stats={stats} onUpvote={handleUpvote} onDownvote={handleDownvote} onCommit={handleCommit} />
        <CommentComposer onSubmit={handleComment} disabled={!viewerDid} />
        <CommentList comments={comments} onVote={handleCommentVote} canVote={Boolean(viewerDid)} />
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
