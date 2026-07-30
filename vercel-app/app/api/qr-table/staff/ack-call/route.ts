import { NextRequest, NextResponse } from 'next/server'
import { ackStaffCall } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'
import { loadSessionById } from '@/lib/qr-table-server'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json().catch(() => ({}))) as { sessionId?: number; storeCode?: string }
    const sessionId = Number(body.sessionId || 0)
    if (!sessionId) {
      return applyPosApiCors(NextResponse.json({ success: false, message: 'sessionId_required' }, { status: 400, headers }))
    }
    const existing = await loadSessionById(sessionId)
    if (!existing) {
      return applyPosApiCors(NextResponse.json({ success: false, message: 'session_not_found' }, { status: 404, headers }))
    }
    const storeCode = String(body.storeCode || existing.storeCode || '').trim()
    const auth = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!auth.ok) return auth.response
    const session = await ackStaffCall(sessionId)
    return applyPosApiCors(NextResponse.json({ success: true, session }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
