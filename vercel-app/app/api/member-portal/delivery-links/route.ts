import { NextRequest, NextResponse } from 'next/server'
import { loadMemberPortalDeliveryLinks } from '@/lib/member-portal-order-server'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { error } = await requireMemberSession(req)
  if (error) return error
  try {
    const links = await loadMemberPortalDeliveryLinks()
    return NextResponse.json({ success: true, links })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'delivery_links_failed', links: null },
      { status: 500 }
    )
  }
}
