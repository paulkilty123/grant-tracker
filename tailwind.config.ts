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
        // Primary teal — Stitch primary #008080
        forest:  '#008080',
        sage:    '#26A69A',
        mint:    '#B2DFDB',
        // Backgrounds — Stitch neutral
        cream:   '#F5F5F7',
        warm:    '#E8E8EC',
        // Accent amber — Stitch tertiary #FFB74D
        gold:    '#FFB74D',
        'gold-light': '#FFCA28',
        // Coral CTA — Stitch secondary #FF7043
        coral:        '#FF7043',
        'coral-light': '#FF8A65',
        // Text — Stitch neutral dark
        charcoal: '#1C1C2E',
        mid:     '#6E6E80',
        light:   '#9E9EA8',
        // Border
        border:  '#D1D1D8',
      },
      fontFamily: {
        sans:    ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        // font-display maps to DM Serif — used as heading/display throughout the app
        display: ['var(--font-dm-serif)', 'serif'],
        serif:   ['var(--font-dm-serif)', 'serif'],
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
