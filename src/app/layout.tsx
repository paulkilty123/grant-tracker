import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, DM_Serif_Display, Space_Grotesk, Fraunces } from 'next/font/google'
import PlausibleProvider from 'next-plausible'
import './globals.css'

const dmSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-dm-serif',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fraunces',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Grant Tracker — UK Funding for CICs, Social Enterprises, Charities & Impact Founders',
  description: 'Find grants, accelerators, social investment, and diversity funding matched to your legal structure and mission. Built for CICs, social enterprises, charities, co-operatives, and impact-driven founders across the UK.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable} ${spaceGrotesk.variable} ${fraunces.variable}`}>
      <head>
        <PlausibleProvider src="https://plausible.io/js/pa-hsmp_h1qvBaZ_YSXf31MJ.js" />
      </head>
      <body>{children}</body>
    </html>
  )
}
