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
  metadataBase: new URL('https://granttracker.co.uk'),
  title: 'Grant Tracker — UK Funding for CICs, Social Enterprises, Charities & Impact Founders',
  description: 'Find grants, accelerators, social investment, and diversity funding matched to your legal structure and mission. Built for CICs, social enterprises, charities, co-operatives, and impact-driven founders across the UK.',
  openGraph: {
    type: 'website',
    url: 'https://granttracker.co.uk',
    siteName: 'Grant Tracker',
    title: 'Grant Tracker — UK Funding, Matched For You',
    description: 'Discover grants, programmes, investment and in-kind support, all matched to your setup and impact priorities. Built for UK charities, CICs, social enterprises and co-operatives.',
    images: [{ url: '/og-image-base.png', width: 1200, height: 630, alt: 'Grant Tracker — UK funding matched for you' }],
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Grant Tracker — UK Funding, Matched For You',
    description: 'Discover grants, programmes, investment and in-kind support, all matched to your setup and impact priorities.',
    images: ['/og-image-base.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
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
