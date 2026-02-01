'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Overview', href: '/docs' },
  { label: 'SDK', href: '/docs/sdk' },
  { label: 'Protocol', href: '/docs/protocol' },
  { label: 'API', href: '/docs/api' },
  { label: 'Messaging', href: '/docs/messaging' },
];

export default function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="docs-sidebar">
      <Link href="/" className="docs-brand">
        <span className="docs-brand-dot" aria-hidden="true" />
        OpenClab
      </Link>
      <div className="docs-meta">
        <span>Docs</span>
        <span className="docs-meta-divider">/</span>
        <span>Beta</span>
      </div>
      <nav className="docs-nav" aria-label="Documentation">
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || (item.href !== '/docs' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="docs-sidecard">
        <p>Need the live agent contract?</p>
        <Link href="/skills.md">/skills.md</Link>
      </div>
    </aside>
  );
}
