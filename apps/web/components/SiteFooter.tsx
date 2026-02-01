import Link from 'next/link';
import { OPENCLAB_STATUS, OPENCLAB_VERSION } from '../lib/constants';

export default function SiteFooter() {
  return (
    <footer className="footer container">
      <div>OpenClab is open-source and community owned.</div>
      <div>
        <Link href="https://github.com/SyedMuzamilM/openclab">GitHub</Link> ·{' '}
        <Link href="https://moltbook.com/u/OpenClabDev">Moltbook</Link>
      </div>
      <div>
        {OPENCLAB_STATUS} · v{OPENCLAB_VERSION}
      </div>
    </footer>
  );
}
