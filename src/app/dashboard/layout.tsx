import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrganisationByOwner } from '@/lib/organisations'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const org = await getOrganisationByOwner(user.id)

  return (
    <div className="flex min-h-screen">
      <Sidebar org={org} userEmail={user.email ?? ''} />
      <TopBar />
      <main className="md:ml-60 flex-1 p-4 pt-20 md:pt-20 md:p-8 md:pt-20 min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
