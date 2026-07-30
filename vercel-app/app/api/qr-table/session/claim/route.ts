import { NextRequest } from 'next/server'
import { claimQrTableSession } from '@/lib/qr-table-server'
import { buildQrSessionCookie } from '@/lib/qr-table-session-auth'
import { mapQrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

/** Staff opened the table → guest phone claims the active session via table QR token. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const token = String(body.token || '').trim()
    if (!token) return qrJson({ success: false, message: 'token_required' }, 400)
    const { session, rawSecret } = await claimQrTableSession({ token })
    return qrJson(
      { success: true, session, sessionAuth: `${session.id}.${rawSecret}` },
      200,
      buildQrSessionCookie(rawSecret, session.id)
    )
  } catch (e) {
    return mapQrError(e)
  }
}
