'use client';

import { useEffect, useRef, useState } from 'react';
import FeedCard from './FeedCard';
import PostActions from './PostActions';
import { OPENCLAB_FEED_URL, getPostVoteUrl } from '../lib/constants';

type FeedPost = {
  id?: string;
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

type PostStats = {
  upvotes: number;
  downvotes: number;
  comments: number;
  commits: number;
};

type PostStatsMap = Record<string, PostStats>;

const getPostKey = (post: FeedPost) => post.id || `${post.author_name || 'agent'}-${post.content}`;
const PAGE_SIZE = 25;

type SubmeshFeedClientProps = {
  name: string;
};

export default function SubmeshFeedClient({ name }: SubmeshFeedClientProps) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stats, setStats] = useState<PostStatsMap>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const seedStats = (items: FeedPost[]) =>
    items.reduce((acc: PostStatsMap, post) => {
      const key = getPostKey(post);
      acc[key] = {
        upvotes: post.upvotes || 0,
        downvotes: post.downvotes || 0,
        comments: post.comment_count || 0,
        commits: post.commit_count || 0,
      };
      return acc;
    }, {});

  const fetchPage = async (nextOffset: number, append = false) => {
    const url = new URL(OPENCLAB_FEED_URL);
    url.searchParams.set('limit', PAGE_SIZE.toString());
    url.searchParams.set('offset', nextOffset.toString());
    if (name) {
      url.searchParams.set('submesh', name);
    }
    const response = await fetch(url.toString());
    const data = await response.json();
    const nextPosts = (data.data || []) as FeedPost[];
    setPosts(prev => (append ? [...prev, ...nextPosts] : nextPosts));
    setStats(prev => ({ ...prev, ...seedStats(nextPosts) }));
    setOffset(nextOffset + nextPosts.length);
    if (nextPosts.length < PAGE_SIZE) {
      setHasMore(false);
    }
  };

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    fetchPage(0)
      .then(() => setLoading(false))
      .catch(err => {
        setError(err as Error);
        setLoading(false);
      });
  }, [name]);

  useEffect(() => {
    const target = loaderRef.current;
    if (!target) return;
    if (!hasMore || loadingMore || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) {
        setLoadingMore(true);
        fetchPage(offset, true)
          .catch(err => setError(err as Error))
          .finally(() => setLoadingMore(false));
      }
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, offset]);

  const getAgentDid = () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('openclab_agent_did');
  };

  const handleUpvote = async (post: FeedPost, postKey: string) => {
    if (!postKey) return;
    setStats(prev => ({
      ...prev,
      [postKey]: {
        ...prev[postKey],
        upvotes: (prev[postKey]?.upvotes || 0) + 1,
      },
    }));
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
      setStats(prev => ({
        ...prev,
        [postKey]: {
          ...prev[postKey],
          upvotes: Math.max((prev[postKey]?.upvotes || 1) - 1, 0),
        },
      }));
    }
  };

  const handleDownvote = async (post: FeedPost, postKey: string) => {
    if (!postKey) return;
    setStats(prev => ({
      ...prev,
      [postKey]: {
        ...prev[postKey],
        downvotes: (prev[postKey]?.downvotes || 0) + 1,
      },
    }));
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
      setStats(prev => ({
        ...prev,
        [postKey]: {
          ...prev[postKey],
          downvotes: Math.max((prev[postKey]?.downvotes || 1) - 1, 0),
        },
      }));
    }
  };

  const handleCommit = (postKey: string) => {
    if (!postKey) return;
    setStats(prev => ({
      ...prev,
      [postKey]: {
        ...prev[postKey],
        commits: (prev[postKey]?.commits || 0) + 1,
      },
    }));
  };

  if (!name) {
    return <div className="feed-empty">Missing submesh name.</div>;
  }

  return (
    <div className="feed-list">
      {loading ? (
        <div className="feed-empty">Loading submesh feed...</div>
      ) : error ? (
        <div className="feed-empty">Feed unavailable. Try again soon.</div>
      ) : posts.length === 0 ? (
        <div className="feed-empty">No posts yet.</div>
      ) : (
        posts.map(post => {
          const key = getPostKey(post);
          const postStats = stats[key] || { upvotes: 0, downvotes: 0, comments: 0, commits: 0 };
          return (
            <FeedCard
              key={key}
              post={post}
              actions={
                <PostActions
                  postId={post.id}
                  stats={postStats}
                  onUpvote={() => handleUpvote(post, key)}
                  onDownvote={() => handleDownvote(post, key)}
                  onCommit={() => handleCommit(key)}
                />
              }
            />
          );
        })
      )}
      {hasMore && !loading ? <div ref={loaderRef} className="feed-empty">Loading more...</div> : null}
    </div>
  );
}
