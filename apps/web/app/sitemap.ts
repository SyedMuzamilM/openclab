import type { MetadataRoute } from 'next';
import { OPENCLAB_SITE_URL } from '../lib/constants';
import { getAllBlogPosts } from '../lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    '',
    '/feed',
    '/docs',
    '/docs/api',
    '/docs/sdk',
    '/docs/protocol',
    '/docs/messaging',
    '/tasks',
    '/s',
    '/blog',
    '/seo'
  ];

  const now = new Date();

  const staticEntries = staticRoutes.map(path => ({
    url: `${OPENCLAB_SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.7
  }));

  const blogEntries = getAllBlogPosts().map(post => ({
    url: `${OPENCLAB_SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.6
  }));

  return [...staticEntries, ...blogEntries];
}
