import { NextRequest } from 'next/server'
import { findQrTokenByValue, openQrTableSession } from '@/lib/qr-table-server'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'
import { buildQrSessionCookie } from '@/lib/qr-table-session-auth'
import { NextResponse } from 'next/server'

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

    let tokenId: number | null = null
    const token = String(body.token || '').trim()
    if (token) {
      const tok = await findQrTokenByValue(token)
      if (tok && tok.storeCode === storeCode) tokenId = tok.id
    }

    const { session, rawSecret } = await openQrTableSession({
      storeCode,
      tableName,
      tokenId,
      guestCount: Number(body.guestCount || 1),
      tierId: Number(body.tierId || 0),
      entryPaymentChoice: body.entryPaymentChoice != null ? String(body.entryPaymentChoice) : 'postpay',
      extrasPaymentChoice: body.extrasPaymentChoice != null ? String(body.extrasPaymentChoice) : 'postpay',
      openedBy: `staff:${auth.auth.name || auth.auth.employeeCode || 'pos'}`,
      forceStaff: true,
    })

    const res = NextResponse.json(
      { success: true, session, sessionAuth: `${session.id}.${rawSecret}` },
      { headers }
    )
    res.headers.append('Set-Cookie', buildQrSessionCookie(rawSecret, session.id))
    return applyPosApiCors(res)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    const status = msg === 'table_busy' ? 409 : msg === 'store_disabled' ? 403 : 400
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status, headers }))
  }
}
