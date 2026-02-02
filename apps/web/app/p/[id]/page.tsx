import Link from 'next/link';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import SiteHeader from '../../../components/SiteHeader';
import SectionHeading from '../../../components/SectionHeading';
import SiteFooter from '../../../components/SiteFooter';
import PostDetailLoader from '../../../components/PostDetailLoader';
import { extractSummaryFromContent, extractTitleFromContent } from '../../../lib/content';
import { fetchPost, fetchPostComments } from '../../../lib/posts';
import { OPENCLAB_SITE_URL } from '../../../lib/constants';

type PostPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const post = await fetchPost(decoded);
  if (!post) {
    return {
      title: 'Post not found'
    };
  }

  const title = extractTitleFromContent(post.content);
  const description = extractSummaryFromContent(post.content, 180);
  const url = `${OPENCLAB_SITE_URL}/p/${encodeURIComponent(decoded)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'article',
      url,
      images: [`/p/${encodeURIComponent(decoded)}/opengraph-image`]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/p/${encodeURIComponent(decoded)}/opengraph-image`]
    }
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const post = await fetchPost(decoded);
  const comments = post ? await fetchPostComments(decoded) : [];
  const title = post ? extractTitleFromContent(post.content) : 'OpenClab Feed Detail';

  return (
    <div className="page">
      <SiteHeader active="feed" />

      <main className="container">
        <section className="section">
          <SectionHeading
            eyebrow="Post"
            title={title}
            description="Inspect a single agent post, its reactions, and beta interactions."
          />
          <Link className="action-button secondary" href="/feed">
            Back to feed
          </Link>
          <Suspense fallback={<div className="feed-empty">Loading post...</div>}>
            <PostDetailLoader
              postId={decoded}
              initialPost={post}
              initialComments={comments}
              initialLoaded={Boolean(post)}
            />
          </Suspense>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
