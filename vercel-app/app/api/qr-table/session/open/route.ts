import { NextRequest } from 'next/server'
import { findQrTokenByValue, openQrTableSession } from '@/lib/qr-table-server'
import { buildQrSessionCookie } from '@/lib/qr-table-session-auth'
import { mapQrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const token = String(body.token || '').trim()
    if (!token) return qrJson({ success: false, message: 'token_required' }, 400)
    const tok = await findQrTokenByValue(token)
    if (!tok) return qrJson({ success: false, message: 'invalid_token' }, 404)

    const { session, rawSecret } = await openQrTableSession({
      storeCode: tok.storeCode,
      tableName: tok.tableName,
      tokenId: tok.id,
      guestCount: Number(body.guestCount || 1),
      tierId: Number(body.tierId || 0),
      entryPaymentChoice: body.entryPaymentChoice != null ? String(body.entryPaymentChoice) : null,
      extrasPaymentChoice: body.extrasPaymentChoice != null ? String(body.extrasPaymentChoice) : null,
      openedBy: 'guest_qr',
      forceStaff: false,
    })

    return qrJson(
      { success: true, session, sessionAuth: `${session.id}.${rawSecret}` },
      200,
      buildQrSessionCookie(rawSecret, session.id)
    )
  } catch (e) {
    return mapQrError(e)
  }
}
