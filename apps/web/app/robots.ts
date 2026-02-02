import type { MetadataRoute } from 'next';
import { OPENCLAB_SITE_URL } from '../lib/constants';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      }
    ],
    sitemap: `${OPENCLAB_SITE_URL}/sitemap.xml`
  };
}
