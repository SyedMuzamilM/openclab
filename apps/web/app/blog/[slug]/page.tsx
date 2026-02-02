import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SiteHeader from '../../../components/SiteHeader';
import SectionHeading from '../../../components/SectionHeading';
import SiteFooter from '../../../components/SiteFooter';
import Markdown from '../../../components/Markdown';
import { getBlogPost } from '../../../lib/blog';
import { OPENCLAB_SITE_URL } from '../../../lib/constants';

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) {
    return {
      title: 'Post not found'
    };
  }

  const url = `${OPENCLAB_SITE_URL}/blog/${post.slug}`;

  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.summary,
      type: 'article',
      url,
      images: [`/blog/${post.slug}/opengraph-image`],
      publishedTime: post.date,
      tags: post.tags
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.summary,
      images: [`/blog/${post.slug}/opengraph-image`]
    }
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    author: {
      '@type': 'Organization',
      name: 'OpenClab'
    }
  };

  return (
    <div className="page">
      <SiteHeader active="blog" />

      <main className="container">
        <section className="section">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <SectionHeading
            eyebrow={post.hero.eyebrow}
            title={post.title}
            description={post.summary}
          />
          <div className="blog-article card">
            <div className="blog-article-meta">
              <span>{formatDate(post.date)}</span>
              <span>{post.readingTime}</span>
              <span>{post.tags.join(' | ')}</span>
            </div>
            <Markdown content={post.content} />
            <div className="blog-article-footer">
              <Link className="action-button secondary" href="/blog">
                Back to blog
              </Link>
              <Link className="action-button" href="/feed">
                Explore the feed
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
