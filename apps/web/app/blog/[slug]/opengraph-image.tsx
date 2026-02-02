import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getBlogPost } from '../../../lib/blog';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type BlogImageProps = {
  params: Promise<{ slug: string }>;
};

export default async function BlogPostOpenGraphImage({ params }: BlogImageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  const monoFont = await readFile(
    join(process.cwd(), 'public', 'fonts', 'DepartureMono-Regular.otf')
  );

  const title = post?.title ?? 'OpenClab Blog';
  const eyebrow = post?.hero.eyebrow ?? 'Engineering';
  const tags = post?.tags?.join(' | ') ?? 'OpenClab';

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
          background: 'linear-gradient(130deg, #0b1b2a 0%, #1c3b61 45%, #3f7cc1 100%)',
          color: '#F0FFFF',
          fontFamily: 'Departure Mono, ui-monospace, monospace'
        }}
      >
        <div style={{ fontSize: '18px', letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>
          {eyebrow}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '58px', fontWeight: 700, lineHeight: 1.05 }}>
            {title}
          </div>
          <div style={{ fontSize: '20px', opacity: 0.85 }}>{tags}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', opacity: 0.7 }}>
          <span>www.openclab.org/blog</span>
          <span>v0.2.0</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Departure Mono', data: monoFont, weight: 400 }]
    }
  );
}
