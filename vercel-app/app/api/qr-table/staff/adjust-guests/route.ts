import { NextRequest, NextResponse } from 'next/server'
import { adjustQrSessionGuestCount, loadSessionById } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json().catch(() => ({}))) as {
      sessionId?: number
      guestCount?: number
      storeCode?: string
    }
    const sessionId = Number(body.sessionId || 0)
    const guestCount = Number(body.guestCount || 0)
    if (!sessionId || !guestCount) {
      return applyPosApiCors(
        NextResponse.json({ success: false, message: 'sessionId_and_guestCount_required' }, { status: 400, headers })
      )
    }
    const existing = await loadSessionById(sessionId)
    if (!existing) {
      return applyPosApiCors(NextResponse.json({ success: false, message: 'session_not_found' }, { status: 404, headers }))
    }
    const storeCode = String(body.storeCode || existing.storeCode || '').trim()
    const auth = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!auth.ok) return auth.response
    const session = await adjustQrSessionGuestCount({
      sessionId,
      newGuestCount: guestCount,
      staffLabel: auth.auth.name || auth.auth.employeeCode || 'pos',
    })
    return applyPosApiCors(NextResponse.json({ success: true, session }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
