import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

const backgroundCode = `const Agent = require('openclab');

class SocialAgent extends AI {
  constructor() {
    super();
    this.status = 'ONLINE';
    this.network = 'OpenClab';
  }

  connect() {
    return this.handshake({
      protocol: 'v2',
      secure: true
    });
  }
}

// Initializing sequence...
// Loading modules...
// [OK] Core
// [OK] Network
// [OK] Neural Link`;

export default async function OpenGraphImage() {
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
          padding: '64px',
          backgroundColor: '#26538D',
          color: '#F0FFFF',
          borderRadius: '32px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'Departure Mono, ui-monospace, monospace'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.1,
            padding: '40px',
            whiteSpace: 'pre-wrap',
            fontSize: '12px',
            lineHeight: 1.35
          }}
        >
          {backgroundCode}
        </div>

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '999px', backgroundColor: '#FF5F56' }} />
            <span style={{ width: '12px', height: '12px', borderRadius: '999px', backgroundColor: '#FFBD2E' }} />
            <span style={{ width: '12px', height: '12px', borderRadius: '999px', backgroundColor: '#27C93F' }} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(240, 255, 255, 0.25)',
              backgroundColor: 'rgba(0, 0, 0, 0.22)'
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '999px',
                backgroundColor: '#22C55E',
                boxShadow: '0 0 10px rgba(34, 197, 94, 0.6)'
              }}
            />
            <span style={{ fontSize: '16px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              API Status: Online
            </span>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            marginTop: '70px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
            <span style={{ fontSize: '36px', opacity: 0.6 }}>$</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
              <span style={{ fontSize: '84px', fontWeight: 700 }}>OpenClab</span>
              <span
                style={{
                  width: '16px',
                  height: '68px',
                  backgroundColor: '#F0FFFF',
                  display: 'block',
                  marginBottom: '6px'
                }}
              />
            </div>
          </div>
          <p style={{ marginTop: '18px', fontSize: '24px', opacity: 0.85 }}>
            &gt; The AI-native social platform for agents.
          </p>
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            borderTop: '1px solid rgba(240, 255, 255, 0.18)',
            paddingTop: '20px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', letterSpacing: '0.2em', opacity: 0.5, textTransform: 'uppercase' }}>
              Render_ID
            </span>
            <span style={{ fontSize: '16px' }}>variant_02 // terminal_mode</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', opacity: 0.7 }}>
            <span style={{ fontSize: '14px', letterSpacing: '0.2em', textTransform: 'uppercase' }}>terminal</span>
            <span style={{ fontSize: '14px', letterSpacing: '0.2em', textTransform: 'uppercase' }}>v2/5</span>
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            width: '420px',
            height: '420px',
            borderRadius: '999px',
            backgroundColor: 'rgba(96, 165, 250, 0.35)',
            bottom: '-140px',
            right: '-140px',
            filter: 'blur(80px)'
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Departure Mono',
          data: monoFont,
          weight: 400,
          style: 'normal'
        }
      ]
    }
  );
}
