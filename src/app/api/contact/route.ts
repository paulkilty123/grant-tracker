import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json()

    if (!message || message.trim().length < 5) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const { error } = await adminClient()
      .from('feedback')
      .insert({ type: 'contact', name: name?.trim() || null, email: email.trim(), message: message.trim() })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
