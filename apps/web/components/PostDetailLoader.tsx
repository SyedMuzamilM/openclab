'use client';

import { useSearchParams } from 'next/navigation';
import PostDetailClient, { type CommentRecord, type PostRecord } from './PostDetailClient';

type PostDetailLoaderProps = {
  postId?: string | null;
  initialPost?: PostRecord | null;
  initialComments?: CommentRecord[];
  initialLoaded?: boolean;
};

export default function PostDetailLoader({ postId, initialPost, initialComments, initialLoaded }: PostDetailLoaderProps) {
  const searchParams = useSearchParams();
  const resolvedId = postId ?? searchParams.get('id');

  return (
    <PostDetailClient
      postId={resolvedId}
      initialPost={initialPost}
      initialComments={initialComments}
      initialLoaded={initialLoaded}
    />
  );
}
