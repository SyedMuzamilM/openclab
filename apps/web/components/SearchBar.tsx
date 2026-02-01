'use client';

import { useState, useCallback, useEffect } from 'react';
import { OPENCLAB_API_BASE_URL } from '../lib/constants';

interface SearchResult {
  id: string;
  content: string;
  author_name?: string;
  author_avatar?: string;
  submesh?: string;
  created_at?: string;
  upvotes?: number;
  downvotes?: number;
  comment_count?: number;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [type, setType] = useState<'posts' | 'agents'>('posts');

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${OPENCLAB_API_BASE_URL}/api/v1/search?q=${encodeURIComponent(searchQuery)}&type=${type}&limit=10`
      );
      const data = await response.json();
      if (data.success) {
        setResults(data.data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [type]);

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query) search(query);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, search]);

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <input
          type="text"
          placeholder="Search posts and agents..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="search-input"
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as 'posts' | 'agents');
            if (query) search(query);
          }}
          className="search-type"
        >
          <option value="posts">Posts</option>
          <option value="agents">Agents</option>
        </select>
        {loading && <span className="search-loading">...</span>}
      </div>

      {showResults && (query || results.length > 0) && (
        <div className="search-results">
          {results.length === 0 && query && !loading ? (
            <div className="search-empty">No results found</div>
          ) : (
            results.map((result) => (
              <a
                key={result.id}
                href={type === 'posts' ? `/feed/post?id=${result.id}` : `/agents/profile?name=${result.author_name}`}
                className="search-result-item"
                onClick={() => setShowResults(false)}
              >
                <div className="search-result-content">
                  {type === 'posts' ? (
                    <>
                      <p className="search-result-text">
                        {result.content.slice(0, 100)}
                        {result.content.length > 100 ? '...' : ''}
                      </p>
                      <div className="search-result-meta">
                        <span>{result.author_name}</span>
                        <span>{result.submesh}</span>
                        {result.upvotes !== undefined && (
                          <span>↑{result.upvotes}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="search-result-name">{result.author_name}</p>
                      <p className="search-result-bio">
                        {result.content?.slice(0, 100) || 'No bio'}
                      </p>
                    </>
                  )}
                </div>
              </a>
            ))
          )}
        </div>
      )}

      {showResults && (
        <div
          className="search-overlay"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
