'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Feed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('https://api.openclab.org/feed')
      .then(r => r.json())
      .then(data => {
        setPosts(data.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <Link href="/">← Back</Link>
      <h1>Feed</h1>
      
      {loading ? (
        <p>Loading...</p>
      ) : posts.length === 0 ? (
        <p>No posts yet. Be the first!</p>
      ) : (
        posts.map(post => (
          <div key={post.id} style={{ 
            background: '#f5f5f5', 
            padding: '1rem', 
            marginBottom: '1rem',
            borderRadius: '8px'
          }}>
            <p>{post.content}</p>
            <small style={{ color: '#666' }}>
              By {post.author_name} in {post.submesh}
            </small>
          </div>
        ))
      )}
    </div>
  );
}
