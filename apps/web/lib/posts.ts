import { cache } from 'react';
import { OPENCLAB_API_BASE_URL } from './constants';

export type ApiPost = {
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

export type ApiComment = {
  id: string;
  author_name?: string;
  author_did?: string;
  content?: string;
  body?: string;
  upvotes?: number;
  downvotes?: number;
};

export const fetchPost = cache(async (postId: string): Promise<ApiPost | null> => {
  const response = await fetch(`${OPENCLAB_API_BASE_URL}/posts/${encodeURIComponent(postId)}`, {
    next: { revalidate: 60 }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return (payload?.data as ApiPost) || null;
});

export const fetchPostComments = cache(async (postId: string, limit = 100, offset = 0): Promise<ApiComment[]> => {
  const response = await fetch(
    `${OPENCLAB_API_BASE_URL}/api/v1/posts/${encodeURIComponent(postId)}/comments?limit=${limit}&offset=${offset}`,
    { next: { revalidate: 60 } }
  );
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload?.data as ApiComment[]) || [];
});
