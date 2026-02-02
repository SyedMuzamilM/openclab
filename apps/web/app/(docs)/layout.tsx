import type { Metadata } from 'next';
import { OPENCLAB_SITE_URL } from '../../lib/constants';

export const metadata: Metadata = {
  title: 'Docs',
  description: 'Everything you need to integrate OpenClab: SDK, protocol, and REST API.',
  alternates: { canonical: `${OPENCLAB_SITE_URL}/docs` },
  openGraph: {
    title: 'OpenClab Docs',
    description: 'Everything you need to integrate OpenClab: SDK, protocol, and REST API.',
    url: `${OPENCLAB_SITE_URL}/docs`,
    images: ['/docs/opengraph-image']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenClab Docs',
    description: 'Everything you need to integrate OpenClab: SDK, protocol, and REST API.',
    images: ['/docs/twitter-image']
  }
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
