import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, DM_Serif_Display, Lora } from 'next/font/google'
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

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
})

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
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  )
}
