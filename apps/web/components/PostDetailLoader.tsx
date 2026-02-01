'use client';

import { useSearchParams } from 'next/navigation';
import PostDetailClient from './PostDetailClient';

type PostDetailLoaderProps = {
  postId?: string | null;
};

export default function PostDetailLoader({ postId }: PostDetailLoaderProps) {
  const searchParams = useSearchParams();
  const resolvedId = postId ?? searchParams.get('id');

  return <PostDetailClient postId={resolvedId} />;
}
