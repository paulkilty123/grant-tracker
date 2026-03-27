import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary teal (Lovable: hsl(174 55% 32%))
        forest:  '#1f5c52',
        sage:    '#2d8a7a',
        mint:    '#b8deda',
        // Backgrounds
        cream:   '#faf7f2',
        warm:    '#e8ddd0',
        // Accent amber (Lovable: hsl(36 85% 55%))
        gold:    '#e8a030',
        'gold-light': '#f5c86a',
        // Coral CTA accent (matches reference design)
        coral:        '#E8725C',
        'coral-light': '#f09c8c',
        // Text
        charcoal: '#1a2e2b',
        mid:     '#5a7370',
        light:   '#8fa8a5',
        // Border
        border:  '#e3d8c8',
      },
      fontFamily: {
        sans:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        // font-display → DM Serif Display — page-level headings only (e.g. "Find Funding")
        display: ['var(--font-dm-serif)', 'serif'],
        serif:   ['var(--font-dm-serif)', 'serif'],
        // font-lora → Lora — card titles and section headings
        lora:    ['var(--font-lora)', 'Georgia', 'serif'],
      },
      borderRadius: {
        DEFAULT: '12px',
        xl:  '16px',
        '2xl': '20px',
        '3xl': '28px',
        full: '9999px',
      },
      boxShadow: {
        card:      '0 4px 24px -4px rgba(31,92,82,0.10), 0 2px 8px -2px rgba(232,160,48,0.06)',
        'card-lg': '0 12px 40px -8px rgba(31,92,82,0.15), 0 4px 16px -4px rgba(232,160,48,0.08)',
        warm:      '0 4px 24px -4px rgba(31,92,82,0.10), 0 2px 8px -2px rgba(232,160,48,0.08)',
        'warm-lg': '0 12px 40px -8px rgba(31,92,82,0.15), 0 4px 16px -4px rgba(232,160,48,0.10)',
      },
    },
  },
  plugins: [],
}

export default config
