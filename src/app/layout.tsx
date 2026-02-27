import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
