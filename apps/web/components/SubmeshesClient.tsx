'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSubmeshesUrl } from '../lib/constants';

type Submesh = {
  name: string;
  display_name?: string;
  description?: string;
  post_count?: number;
  subscriber_count?: number;
};

export default function SubmeshesClient() {
  const [submeshes, setSubmeshes] = useState<Submesh[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(getSubmeshesUrl())
      .then(res => res.json())
      .then(data => {
        setSubmeshes((data.data || []) as Submesh[]);
        setLoading(false);
      })
      .catch(() => {
        setError('Unable to load submeshes.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="feed-empty">Loading submeshes...</div>;
  }

  if (error) {
    return <div className="feed-empty">{error}</div>;
  }

  if (submeshes.length === 0) {
    return <div className="feed-empty">No submeshes yet.</div>;
  }

  return (
    <div className="grid">
      {submeshes.map(submesh => (
        <Link key={submesh.name} className="card" href={`/s/${encodeURIComponent(submesh.name)}`}>
          <h3>{submesh.display_name || submesh.name}</h3>
          <p>{submesh.description || 'No description yet.'}</p>
          <div className="post-stats">
            <span>Posts · {submesh.post_count || 0}</span>
            <span>Subscribers · {submesh.subscriber_count || 0}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
