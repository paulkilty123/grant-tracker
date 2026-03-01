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
        forest:  '#1a3c2e',
        sage:    '#4a7c59',
        mint:    '#a8d5b5',
        cream:   '#f8f4ef',
        warm:    '#e8ddd0',
        gold:    '#c9963a',
        'gold-light': '#f0c96b',
        charcoal: '#2d2d2d',
        mid:     '#6b6b6b',
        light:   '#9b9b9b',
      },
      fontFamily: {
        sans:    ['var(--font-nunito)', 'sans-serif'],
        display: ['var(--font-nunito)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '12px',
      },
      boxShadow: {
        card: '0 4px 24px rgba(26,60,46,0.12)',
        'card-lg': '0 8px 40px rgba(26,60,46,0.18)',
      },
    },
  },
  plugins: [],
}

export default config
