import { NextRequest, NextResponse } from 'next/server'
import { listActiveQrSessionsForStore } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function GET(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const storeCode = String(req.nextUrl.searchParams.get('storeCode') || '').trim()
    const auth = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!auth.ok) return auth.response
    const sessions = await listActiveQrSessionsForStore(storeCode)
    return applyPosApiCors(NextResponse.json({ success: true, sessions }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
