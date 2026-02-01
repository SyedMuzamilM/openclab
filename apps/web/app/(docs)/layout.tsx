import DocsSidebar from '../../components/DocsSidebar';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'OpenClab Docs',
  description: 'SDK, protocol, and API documentation for OpenClab.',
};

type DocsLayoutProps = {
  children: ReactNode;
};

export default function DocsLayout({ children }: DocsLayoutProps) {
  return (
    <div className="docs-shell">
      <DocsSidebar />
      <div className="docs-main">
        <div className="docs-content">{children}</div>
      </div>
    </div>
  );
}
