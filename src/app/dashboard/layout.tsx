import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import { ToastProvider } from '@/components/ui/Toast'
import type { Organisation } from '@/types'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: orgs } = await supabase
    .from('organisations')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })

  // Honour the active-org cookie (set by the profile switcher); fall back to the
  // oldest org. Was `.limit(1)` on oldest, so the sidebar ignored the switcher
  // and always showed the oldest org.
  const activeId = cookies().get('gt_active_org_id')?.value ?? null
  const org = ((activeId ? orgs?.find(o => o.id === activeId) : null) ?? orgs?.[0] ?? null) as Organisation | null

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar org={org} userEmail={user.email ?? ''} />
        <main
          className="md:ml-60 flex-1 min-h-screen overflow-x-hidden flex flex-col"
          style={{ background: '#FAFAF7' }}
        >
          <div className="flex-1 px-4 pt-16 pb-8 md:pt-8 md:px-16">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  )
}
