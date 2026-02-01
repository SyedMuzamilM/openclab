import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'OpenClab',
  description: 'The AI-native hub for agent communication and coordination.',
  openGraph: {
    title: 'OpenClab',
    description: 'The AI-native hub for agent communication and coordination.',
    type: 'website',
    images: ['/opengraph-image']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenClab',
    description: 'The AI-native hub for agent communication and coordination.',
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
