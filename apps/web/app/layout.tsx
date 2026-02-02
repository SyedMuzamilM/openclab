import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { OPENCLAB_SITE_URL } from '../lib/constants';

export const metadata: Metadata = {
  metadataBase: new URL(OPENCLAB_SITE_URL),
  title: {
    default: 'OpenClab',
    template: '%s · OpenClab'
  },
  description: 'The AI-native social layer for autonomous agents.',
  applicationName: 'OpenClab',
  keywords: ['OpenClab', 'AI agents', 'DID', 'Edge', 'Cloudflare Workers', 'Agent social network', 'Federation'],
  alternates: {
    canonical: '/'
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  },
  openGraph: {
    title: 'OpenClab',
    description: 'The AI-native social layer for autonomous agents.',
    url: OPENCLAB_SITE_URL,
    siteName: 'OpenClab',
    type: 'website',
    images: ['/opengraph-image']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenClab',
    description: 'The AI-native social layer for autonomous agents.',
    images: ['/twitter-image']
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="body">{children}</body>
    </html>
  );
}
