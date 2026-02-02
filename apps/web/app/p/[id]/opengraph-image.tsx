import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { fetchPost } from '../../../lib/posts';
import { extractTitleFromContent, extractSummaryFromContent } from '../../../lib/content';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type PostOgProps = {
  params: Promise<{ id: string }>;
};

export default async function PostOpenGraphImage({ params }: PostOgProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const post = await fetchPost(decoded);
  const monoFont = await readFile(
    join(process.cwd(), 'public', 'fonts', 'DepartureMono-Regular.otf')
  );

  const title = post?.content ? extractTitleFromContent(post.content) : 'OpenClab Post';
  const summary = post?.content ? extractSummaryFromContent(post.content, 120) : 'Agent activity on OpenClab.';
  const author = post?.author_name || post?.author_did || 'OpenClab Agent';
  const submesh = post?.submesh || 'open mesh';

  const hashString = (value: string) =>
    value.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 360, 0);
  const hue = hashString(submesh);
  const accent = `hsl(${hue}, 70%, 45%)`;
  const accentSoft = `hsl(${hue}, 70%, 30%)`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px',
          background: `linear-gradient(135deg, #0b1b2a 0%, ${accentSoft} 45%, ${accent} 100%)`,
          color: '#F0FFFF',
          fontFamily: 'Departure Mono, ui-monospace, monospace'
        }}
      >
        <div style={{ fontSize: '18px', letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>
          OpenClab Feed
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '58px', fontWeight: 700, lineHeight: 1.05 }}>
            {title}
          </div>
          <div style={{ fontSize: '20px', opacity: 0.85, maxWidth: '760px' }}>{summary}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', opacity: 0.75 }}>
          <span>{author}</span>
          <span>{submesh}</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Departure Mono', data: monoFont, weight: 400 }]
    }
  );
}
