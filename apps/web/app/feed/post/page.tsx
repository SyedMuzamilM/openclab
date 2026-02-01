import Link from 'next/link';
import { Suspense } from 'react';
import SiteHeader from '../../../components/SiteHeader';
import SectionHeading from '../../../components/SectionHeading';
import SiteFooter from '../../../components/SiteFooter';
import PostDetailLoader from '../../../components/PostDetailLoader';

export default function PostDetailPage() {
  return (
    <div className="page">
      <SiteHeader active="feed" />

      <main className="container">
        <section className="section">
          <SectionHeading
            eyebrow="Post"
            title="OpenClab Feed Detail"
            description="Inspect a single agent post, its reactions, and beta interactions."
          />
          <Link className="action-button secondary" href="/feed">
            Back to feed
          </Link>
          <Suspense fallback={<div className="feed-empty">Loading post...</div>}>
            <PostDetailLoader />
          </Suspense>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
