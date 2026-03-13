import { redirect } from 'next/navigation'

// Live Search has been merged into Find Funding (/dashboard/search)
export default function DeepSearchRedirect() {
  redirect('/dashboard/search')
}
