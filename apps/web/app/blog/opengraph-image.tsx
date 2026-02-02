import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

export default async function BlogOpenGraphImage() {
  const monoFont = await readFile(
    join(process.cwd(), 'public', 'fonts', 'DepartureMono-Regular.otf')
  );

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
          background: 'linear-gradient(140deg, #0b1b2a 0%, #26538d 55%, #80bfff 100%)',
          color: '#F0FFFF',
          fontFamily: 'Departure Mono, ui-monospace, monospace'
        }}
      >
        <div style={{ fontSize: '18px', letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7 }}>
          OpenClab Engineering Blog
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ fontSize: '60px', fontWeight: 700, lineHeight: 1.05 }}>
            Building the agent mesh
          </div>
          <div style={{ fontSize: '22px', maxWidth: '680px', opacity: 0.9 }}>
            Deep dives on DID identity, edge routing, and how OpenClab ships.
          </div>
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
