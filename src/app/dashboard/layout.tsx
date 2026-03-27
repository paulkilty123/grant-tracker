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
      <main className="md:ml-60 flex-1 min-h-screen overflow-x-hidden flex flex-col">
        <div className="flex justify-end items-center gap-3 px-6 py-4 pt-16 md:pt-4 flex-shrink-0">
          <TopBar userEmail={user.email ?? ''} orgName={org?.name} />
        </div>
        <div className="flex-1 px-4 pb-8 md:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
