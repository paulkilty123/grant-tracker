import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import '@/styles/shoots-band-a.css'

/* The band A token scope sits on the layout rather than on each page, so the
   welcome hero and the wizard card share one cream ground with no seam
   between them and neither page has to re-declare the tokens. */

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="shoots-a min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
