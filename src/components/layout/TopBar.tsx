'use client'

import { useRouter } from 'next/navigation'
import { Search, Bell } from 'lucide-react'
import Link from 'next/link'

export default function TopBar() {
  const router = useRouter()

  return (
    <div className="fixed top-0 right-0 left-0 md:left-60 z-30 bg-white border-b border-warm/60 px-6 h-14 flex items-center gap-4"
      style={{ boxShadow: '0 1px 0 rgba(26,46,43,0.06)' }}>
      {/* Search */}
      <div className="flex-1 max-w-lg">
        <button
          onClick={() => router.push('/dashboard/search')}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg border border-warm bg-[#faf7f2] text-sm text-gray-400 hover:border-gray-300 transition-colors text-left"
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          Search grants or projects…
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-1 ml-auto">
        <button className="p-2 rounded-lg text-mid hover:bg-[#f5f2ed] transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <Link href="/dashboard/profile"
          className="px-3 py-1.5 text-xs font-semibold text-mid hover:text-charcoal uppercase tracking-wider transition-colors">
          Edit Profile
        </Link>
        <Link href="/dashboard/feedback"
          className="px-3 py-1.5 text-xs font-semibold text-mid hover:text-charcoal uppercase tracking-wider transition-colors">
          Feedback
        </Link>
      </div>
    </div>
  )
}
