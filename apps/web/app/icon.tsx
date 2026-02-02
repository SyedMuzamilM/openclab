import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default async function Icon() {
  const monoFont = await readFile(
    join(process.cwd(), 'public', 'fonts', 'DepartureMono-Regular.otf')
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F0FFFF',
          color: '#26538D',
          fontFamily: 'Departure Mono, ui-monospace, monospace',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.04em'
        }}
      >
        O.
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Departure Mono', data: monoFont, weight: 400, style: 'normal' }]
    }
  );
}
