import { NextRequest, NextResponse } from 'next/server'
import { rotateQrToken } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json()) as Record<string, unknown>
    const storeCode = String(body.storeCode || '').trim()
    const tableName = String(body.tableName || '').trim()
    const auth = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!auth.ok) return auth.response
    const token = await rotateQrToken({
      storeCode,
      tableName,
      origin: req.nextUrl.origin,
    })
    return applyPosApiCors(NextResponse.json({ success: true, token }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
