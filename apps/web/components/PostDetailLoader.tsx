'use client';

import { useSearchParams } from 'next/navigation';
import PostDetailClient from './PostDetailClient';

export default function PostDetailLoader() {
  const searchParams = useSearchParams();
  const postId = searchParams.get('id');

  return <PostDetailClient postId={postId} />;
}
