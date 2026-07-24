import type { Config } from 'tailwindcss'

/**
 * Grant Tracker — Design token source of truth.
 * Aligned with the April 2026 design-spec overhaul:
 *  - Primary brand: lime #8ECB3C on deep-forest #173404
 *  - 4-category funding system: green / coral / blue / amber
 *  - Cream #F5F1E8 for neutral surfaces, page bg #FAFAF7
 *  - Type: Space Grotesk headings/UI, Plus Jakarta Sans body,
 *    DM Serif reserved for 2 decorative spots (enforced in code review).
 *
 * Legacy names (forest/sage/coral/gold/warm/cream) are kept as aliases
 * pointing at the closest new token so existing components still resolve
 * while surfaces are migrated page-by-page.
 */
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Greens (primary brand)
        'green-lime':      '#8ECB3C',
        'green-mid':       '#639922',
        'green-deep':      '#173404',
        'green-pale-1':    '#F1F7E4',
        'green-pale-2':    '#EAF3DE',
        'green-pale-3':    '#C0DD97',
        'green-pale-hover':'#FAFCF5',
        'green-text-deep': '#3B6D11',
        'green-text-nav':  '#97C459',
        'green-active':    '#27500A',

        // Cream / neutral surfaces
        'cream-1':         '#F5F1E8',
        'bg-page':         '#FAFAF7',
        'bg-pill-neutral': '#F1F0EA',
        'toggle-off':      '#D9D6CB',

        // Coral (Programmes + Declined + urgent)
        'coral-pale':      '#FAECE7',
        'coral-mid':       '#F5C4B3',
        'coral-saturated': '#D85A30',
        'coral-deep':      '#993C1D',
        'coral-deepest':   '#4A1B0C',

        // Blue (Social Investment only)
        'blue-pale':       '#E6F1FB',
        'blue-mid':        '#B5D4F4',
        'blue-saturated':  '#378ADD',
        'blue-deep':       '#0C447C',
        'blue-deepest':    '#042C53',

        // Amber (In-Kind + helper/assistant + warnings)
        'amber-pale':      '#FAEEDA',
        'amber-mid':       '#FAC775',
        'amber-saturated': '#BA7517',
        'amber-deep':      '#854F0B',
        'amber-deepest':   '#412402',

        // Text semantic
        'text-primary':    '#2C2C2A',
        'text-secondary':  '#5F5E5A',
        'text-tertiary':   '#8A8986',

        // Legacy aliases (remapped to new tokens)
        forest:   '#173404',
        'sage-deep': '#639922',  // was bare `sage` — renamed, name collision with new sage accent (see below)
        mint:     '#C0DD97',
        // `cream` retired: old value (#FAFAF7, aliased to bg-page) is now covered by
        // `surface-page` (#FBF9F4, added below) — see the collision resolution note.
        warm:     '#E8E0D1',
        gold:     '#BA7517',
        'gold-light': '#FAC775',
        coral:         '#D85A30',
        'coral-light': '#F5C4B3',
        charcoal: '#2C2C2A',
        mid:      '#5F5E5A',
        light:    '#8A8986',
        // `border` retired: old value (#E4E2DA) is now covered by `border-warm`
        // (#E8E0D1, added below) — see the collision resolution note.

        // ============================================================
        // SHOOTS TOKENS (new, coexisting) — from shoots-app-tokens.md.
        // Additive only: nothing above is removed or repointed yet,
        // except the three resolved name collisions:
        //  - old `sage` (#639922) -> `sage-deep` above; new `sage`
        //    (#9BCA9D) below is the brand accent, a different colour.
        //  - old `cream` (#FAFAF7) -> retired, repointed to
        //    `surface-page`; new `cream` (#F6F1E7) below is the brand
        //    accent, a different colour.
        //  - old `border` (#E4E2DA) -> retired, repointed to
        //    `border-warm`.
        // `gold` is a fourth, newly-found collision the source doc
        // didn't flag (old `gold` #BA7517 above vs. new accent `gold`
        // #EBCE78) and remains unresolved — not added below.
        // ============================================================

        // Surfaces
        'surface-page':    '#FBF9F4',
        'surface-card':    '#FFFFFF',
        'surface-sunken':  '#F6F1E7',
        'surface-pill':    '#F1F0EA',
        'surface-inverse': '#1D3C3E',

        // Text
        'text-heading':     '#1D3C3E',
        'text-body':        '#2E2E2E',
        'text-muted':       '#5F6B64',
        'text-subtle':      '#8A978F',
        'text-on-dark':     '#F6F1E7',
        'text-on-dark-mut': '#B8C7C2',

        // Borders and focus
        'border-hairline': 'rgba(29,60,62,0.10)',
        'border-mid':      'rgba(29,60,62,0.15)',
        'border-strong':   'rgba(29,60,62,0.25)',
        'border-warm':     '#E8E0D1',
        'focus-ring':       '#4EAAB4',

        // Brand and action (gold deferred — see note above)
        deep:  '#1D3C3E',
        cream: '#F6F1E7',
        terra: '#D67558',
        teal:  '#4EAAB4',
        sage:  '#9BCA9D',
        sky:   '#ABCBEE',

        // Funding types (category colours, always paired with a label)
        'type-grant':           '#EBCE78',
        'type-grant-pale':      '#FAEEDA',
        'type-investment':      '#D67558',
        'type-investment-pale': '#FAECE7',
        'type-programme':       '#4EAAB4',
        'type-programme-pale':  '#E6F1FB',
        'type-inkind':          '#9BCA9D',
        'type-inkind-pale':     '#EAF3DE',

        // Semantic states (unchanged values from today — deliberately)
        'state-success':      '#3B6D11',
        'state-success-pale': '#EAF3DE',
        'state-warning':      '#854F0B',
        'state-warning-pale': '#FAEEDA',
        'state-error':        '#993C1D',
        'state-error-pale':   '#FAECE7',
        'state-info':         '#0C447C',
        'state-info-pale':    '#E6F1FB',
      },
      fontFamily: {
        sans:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-space-grotesk)', 'var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        serif:   ['var(--font-dm-serif)', 'Georgia', 'serif'],
      },
      fontSize: {
        'hero':    ['56px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '500' }],
        'h1-xl':   ['36px', { lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: '500' }],
        'h2-spec': ['28px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '500' }],
        'h3-spec': ['20px', { lineHeight: '1.3',  letterSpacing: '-0.01em', fontWeight: '500' }],
      },
      borderRadius: {
        'input':  '10px',
        'card':   '14px',
        'modal':  '16px',
        'badge':  '8px',
        DEFAULT: '10px',
        md:      '8px',
        lg:      '10px',
        xl:      '14px',
        '2xl':   '16px',
        '3xl':   '20px',
        full:    '9999px',
      },
      boxShadow: {
        'segment-active': '0 1px 2px rgba(0, 0, 0, 0.06)',
        'modal':          '0 24px 60px rgba(0, 0, 0, 0.18)',
        'sticky-footer':  '0 -2px 10px rgba(0, 0, 0, 0.03)',
        card:      '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'card-lg': '0 6px 20px -4px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
        warm:      '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03)',
        'warm-lg': '0 6px 20px -4px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
}

export default config
