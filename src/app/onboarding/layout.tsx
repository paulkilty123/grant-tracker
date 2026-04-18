import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAFAF7' }}>
      <header className="px-6 md:px-10 pt-6 md:pt-8 flex-shrink-0">
        <Link href="/" className="no-underline inline-flex items-center gap-2">
          <span
            className="font-bold text-lg"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#2C2C2A', letterSpacing: '-0.02em' }}
          >
            Grant<span style={{ color: '#8ECB3C' }}>Tracker</span>
          </span>
        </Link>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
