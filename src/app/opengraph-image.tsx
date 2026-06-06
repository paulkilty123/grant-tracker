import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Grant Tracker — UK funding, matched for you'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#173404',
          color: '#FAF7F2',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Wordmark — two-pill mark + GrantTracker. Two-pill geometry mirrors
            LogoMark.tsx (cream short pill + green tall pill on the forest
            background that this image already provides). Pills sized for
            a 48px icon-height equivalent; bottom-aligned. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 48 }}>
            {/* short pill (left) */}
            <div style={{ width: 14, height: 24, borderRadius: 7, background: '#F5F1E8' }} />
            {/* tall pill (right) */}
            <div style={{ width: 14, height: 40, borderRadius: 7, background: '#7CC242' }} />
          </div>
          <span
            style={{
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#FAF7F2',
            }}
          >
            GrantTracker
          </span>
        </div>

        {/* Headline + supporting copy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 96,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: '-0.04em',
            }}
          >
            <span>UK funding,</span>
            <span style={{ color: '#8ECB3C' }}>matched for you.</span>
          </div>
          <span
            style={{
              fontSize: 30,
              color: '#C0DD97',
              maxWidth: 940,
              lineHeight: 1.4,
            }}
          >
            Discover grants, programmes, investment and in-kind support — for UK charities, CICs, social enterprises and co-operatives.
          </span>
        </div>

        {/* Footer URL */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 24, color: '#97C459', letterSpacing: '0.01em' }}>
            granttracker.co.uk
          </span>
          <span style={{ fontSize: 18, color: '#97C459', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
            Founding cohort open
          </span>
        </div>
      </div>
    ),
    { ...size }
  )
}
