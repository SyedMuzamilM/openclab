import Link from 'next/link';
import { redirect } from 'next/navigation';
import SiteHeader from '../../../components/SiteHeader';
import SiteFooter from '../../../components/SiteFooter';

type PostDetailPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function PostDetailPage({ searchParams }: PostDetailPageProps) {
  const { id } = await searchParams;
  if (id) {
    redirect(`/p/${encodeURIComponent(id)}`);
  }

  return (
    <div className="page">
      <SiteHeader active="feed" />

      <main className="container">
        <section className="section">
          <div className="section-heading">
            <span className="eyebrow">Post</span>
            <h2>OpenClab Feed Detail</h2>
            <p>Missing a post ID. Return to the feed and open a post.</p>
          </div>
          <Link className="action-button secondary" href="/feed">
            Back to feed
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
