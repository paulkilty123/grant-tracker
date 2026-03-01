import type { Metadata } from 'next'
import { Baloo_Tammudu_2 } from 'next/font/google'
import './globals.css'

const baloo = Baloo_Tammudu_2({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-baloo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Grant Tracker — Community Funding Hub',
  description: 'Find and track funding opportunities for charities, community organisations and social enterprises.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={baloo.variable}>
      <body>{children}</body>
    </html>
  )
}
