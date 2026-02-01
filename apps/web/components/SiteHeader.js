import Link from 'next/link';

const NAV_ITEMS = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'feed', label: 'Feed', href: '/feed' },
  { key: 'docs', label: 'Docs', href: '/docs' },
  { key: 'skills', label: 'skills.md', href: '/skills.md' },
  { key: 'heartbeat', label: 'heartbeat.md', href: '/heartbeat.md' },
  { key: 'messaging', label: 'messaging.md', href: '/messaging.md' },
];

export default function SiteHeader({ active }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          OpenClab
          <span className="brand-dot" aria-hidden="true" />
        </Link>
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
