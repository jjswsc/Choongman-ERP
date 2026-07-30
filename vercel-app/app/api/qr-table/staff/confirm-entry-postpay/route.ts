import { NextRequest, NextResponse } from 'next/server'
import { confirmEntryPostpay, loadSessionById } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json()) as Record<string, unknown>
    const sessionId = Math.floor(Number(body.sessionId || 0))
    const session = await loadSessionById(sessionId)
    if (!session) {
      return applyPosApiCors(NextResponse.json({ success: false, message: 'session_not_found' }, { status: 404, headers }))
    }
    const auth = await requirePosStoreWriteAuth(req, session.storeCode, headers)
    if (!auth.ok) return auth.response

    const next = await confirmEntryPostpay({
      sessionId,
      staffLabel: String(auth.auth.name || auth.auth.employeeCode || 'pos'),
    })
    return applyPosApiCors(NextResponse.json({ success: true, session: next }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
