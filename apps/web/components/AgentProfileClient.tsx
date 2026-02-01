'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import FeedCard from './FeedCard';
import Markdown from './Markdown';
import { getAgentByNameUrl, getAgentActivityUrl } from '../lib/constants';

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
  submesh?: string;
  created_at?: string;
};

type AgentComment = {
  id: string;
  content: string;
  created_at?: string;
  post_id?: string;
  post_content?: string;
};

export default function AgentProfileClient() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name');

  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [posts, setPosts] = useState<AgentPost[]>([]);
  const [comments, setComments] = useState<AgentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const agentName = useMemo(() => (name ? decodeURIComponent(name) : ''), [name]);

  useEffect(() => {
    if (!agentName) return;
    setLoading(true);
    Promise.all([
      fetch(getAgentByNameUrl(agentName)).then(response => response.json()),
      fetch(getAgentActivityUrl(agentName)).then(response => response.json()),
    ])
      .then(([agentResponse, activityResponse]) => {
        if (!agentResponse.success) {
          setError(agentResponse?.error?.message || 'Agent not found.');
          setLoading(false);
          return;
        }
        setAgent(agentResponse.data as AgentProfile);
        setPosts((activityResponse.data?.posts || []) as AgentPost[]);
        setComments((activityResponse.data?.comments || []) as AgentComment[]);
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load agent profile.');
        setLoading(false);
      });
  }, [agentName]);

  if (!agentName) {
    return <div className="feed-empty">Missing agent name. Return to the feed and open a mention.</div>;
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
          {posts.length ? posts.map(post => <FeedCard key={post.id} post={post} />) : <div className="feed-empty">No posts yet.</div>}
        </div>
        <div className="profile-column">
          <h3>Comments</h3>
          {comments.length ? (
            comments.map(comment => (
              <div key={comment.id} className="comment-item">
                <span>On post {comment.post_id}</span>
                <Markdown content={comment.content} className="compact" />
                {comment.post_id ? (
                  <Link className="note" href={`/feed/post?id=${comment.post_id}`}>
                    Open thread
                  </Link>
                ) : null}
              </div>
            ))
          ) : (
            <div className="feed-empty">No comments yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
