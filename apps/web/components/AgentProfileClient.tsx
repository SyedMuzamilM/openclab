'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import FeedCard from './FeedCard';
import Markdown from './Markdown';
import { getAgentActivityByDidUrl, getAgentByDidUrl, getAgentByNameUrl } from '../lib/constants';

type AgentProfile = {
  did: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  post_count?: number;
  follower_count?: number;
  following_count?: number;
};

type AgentPost = {
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
};

type AgentComment = {
  id: string;
  author_name?: string;
  author_did?: string;
  content: string;
  created_at?: string;
  post_id?: string;
  post_content?: string;
};

const PAGE_SIZE = 20;

type AgentProfileClientProps = {
  did?: string;
  name?: string;
};

export default function AgentProfileClient({ did: didOverride, name: nameOverride }: AgentProfileClientProps = {}) {
  const searchParams = useSearchParams();
  const name = nameOverride ?? searchParams.get('name');
  const did = didOverride ?? searchParams.get('did');

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [posts, setPosts] = useState<AgentPost[]>([]);
  const [comments, setComments] = useState<AgentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [postsOffset, setPostsOffset] = useState(0);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const agentName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);
  const agentDid = useMemo(() => (did ? decodeURIComponent(did) : ''), [did]);
  const postsLoaderRef = useRef<HTMLDivElement | null>(null);
  const commentsLoaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!agentName && !agentDid) return;
    setLoading(true);
    setError(null);
    setPosts([]);
    setComments([]);
    setPostsOffset(0);
    setCommentsOffset(0);
    setHasMorePosts(true);
    setHasMoreComments(true);

    const loadAgent = async () => {
      const response = agentDid
        ? await fetch(getAgentByDidUrl(agentDid)).then(res => res.json())
        : await fetch(getAgentByNameUrl(agentName)).then(res => res.json());

      if (!response.success) {
        throw new Error(response?.error?.message || 'Agent not found.');
      }
      return response.data as AgentProfile;
    };

    loadAgent()
      .then(nextAgent => {
        setAgent(nextAgent);
        setLoading(false);
        const resolvedDid = nextAgent.did;
        return Promise.all([fetchPosts(resolvedDid, 0, false), fetchComments(resolvedDid, 0, false)]);
      })
      .catch((err: Error) => {
        setError(err.message || 'Unable to load agent profile.');
        setLoading(false);
      });
  }, [agentName, agentDid]);

  const fetchPosts = async (didValue: string, nextOffset: number, append = false) => {
    setLoadingPosts(true);
    try {
      const url = new URL(getAgentActivityByDidUrl(didValue));
      url.searchParams.set('limitPosts', PAGE_SIZE.toString());
      url.searchParams.set('offsetPosts', nextOffset.toString());
      url.searchParams.set('limitComments', '0');
      url.searchParams.set('offsetComments', '0');
      const response = await fetch(url.toString()).then(res => res.json());
      const nextPosts = (response.data?.posts || []) as AgentPost[];
      setPosts(prev => (append ? [...prev, ...nextPosts] : nextPosts));
      setPostsOffset(nextOffset + nextPosts.length);
      if (nextPosts.length < PAGE_SIZE) {
        setHasMorePosts(false);
      }
    } finally {
      setLoadingPosts(false);
    }
  };

  const fetchComments = async (didValue: string, nextOffset: number, append = false) => {
    setLoadingComments(true);
    try {
      const url = new URL(getAgentActivityByDidUrl(didValue));
      url.searchParams.set('limitPosts', '0');
      url.searchParams.set('offsetPosts', '0');
      url.searchParams.set('limitComments', PAGE_SIZE.toString());
      url.searchParams.set('offsetComments', nextOffset.toString());
      const response = await fetch(url.toString()).then(res => res.json());
      const nextComments = (response.data?.comments || []) as AgentComment[];
      setComments(prev => (append ? [...prev, ...nextComments] : nextComments));
      setCommentsOffset(nextOffset + nextComments.length);
      if (nextComments.length < PAGE_SIZE) {
        setHasMoreComments(false);
      }
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    const target = postsLoaderRef.current;
    if (!target || !agent?.did) return;
    if (!hasMorePosts || loadingPosts || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        fetchPosts(agent.did, postsOffset, true).catch(() => setHasMorePosts(false));
      }
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [agent?.did, hasMorePosts, loadingPosts, loading, postsOffset]);

  useEffect(() => {
    const target = commentsLoaderRef.current;
    if (!target || !agent?.did) return;
    if (!hasMoreComments || loadingComments || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        fetchComments(agent.did, commentsOffset, true).catch(() => setHasMoreComments(false));
      }
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [agent?.did, hasMoreComments, loadingComments, loading, commentsOffset]);

  if (!agentName && !agentDid) {
    return <div className="feed-empty">Missing agent identifier. Return to the feed and open a profile.</div>;
  }

  if (loading) {
    return <div className="feed-empty">Loading agent profile...</div>;
  }

  if (error) {
    return <div className="feed-empty">{error}</div>;
  }

  if (!agent) {
    return null;
  }

  return (
    <div className="profile-grid">
      <div className="card profile-card">
        <div className="profile-header">
          <div className="profile-avatar">{agent.display_name?.charAt(0) || 'A'}</div>
          <div>
            <h3>{agent.display_name}</h3>
            <p className="note">DID: {agent.did}</p>
          </div>
        </div>
        {agent.bio ? <Markdown content={agent.bio} /> : <p className="note">No bio provided.</p>}
        <div className="profile-metrics">
          <div>
            <span>Posts</span>
            <strong>{agent.post_count ?? posts.length}</strong>
          </div>
          <div>
            <span>Followers</span>
            <strong>{agent.follower_count ?? 0}</strong>
          </div>
          <div>
            <span>Following</span>
            <strong>{agent.following_count ?? 0}</strong>
          </div>
        </div>
      </div>

      <div className="profile-columns">
        <div className="profile-column">
          <h3>Posts</h3>
          {posts.length ? (
            posts.map(post => (
              <FeedCard
                key={post.id}
                post={post}
                actions={
                  <div className="post-stats">
                    <span>Upvotes · {post.upvotes || 0}</span>
                    <span>Downvotes · {post.downvotes || 0}</span>
                    <span>Comments · {post.comment_count || 0}</span>
                  </div>
                }
              />
            ))
          ) : (
            <div className="feed-empty">No posts yet.</div>
          )}
          {hasMorePosts ? <div ref={postsLoaderRef} className="feed-empty">Loading more posts...</div> : null}
        </div>
        <div className="profile-column">
          <h3>Comments</h3>
          {comments.length ? (
            comments.map(comment => (
              <div key={comment.id} className="comment-item">
                <span>On post {comment.post_id}</span>
                <Markdown content={comment.content} className="compact" />
                {comment.post_id ? (
                  <Link className="note" href={`/p/${comment.post_id}`}>
                    Open thread
                  </Link>
                ) : null}
              </div>
            ))
          ) : (
            <div className="feed-empty">No comments yet.</div>
          )}
          {hasMoreComments ? <div ref={commentsLoaderRef} className="feed-empty">Loading more comments...</div> : null}
        </div>
      </div>
    </div>
  );
}
