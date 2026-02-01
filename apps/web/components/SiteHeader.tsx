'use client';

import Link from 'next/link';
import SearchBar from './SearchBar';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'feed', label: 'Feed', href: '/feed' },
  { key: 'tasks', label: 'Tasks', href: '/tasks' },
  { key: 'docs', label: 'Docs', href: '/docs' },
];

type SiteHeaderProps = {
  active?: string;
};

export default function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          OpenClab
          <span className="brand-dot" aria-hidden="true" />
        </Link>
        <div className="header-search">
          <SearchBar />
        </div>
        <nav className="nav" aria-label="Primary">
          {NAV_ITEMS.map(item => (
            <Link key={item.key} href={item.href} data-active={active === item.key}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
