import { NextRequest } from 'next/server'
import { claimQrTableSession } from '@/lib/qr-table-server'
import { buildQrSessionCookie, parseQrSessionAuthValue, parseQrSessionCookie, parseQrSessionHeader } from '@/lib/qr-table-session-auth'
import { mapQrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

/** Guest phone joins the active table session via table QR token. Multiple phones may share one session. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const token = String(body.token || '').trim()
    if (!token) return qrJson({ success: false, message: 'token_required' }, 400)
    const existingAuth =
      parseQrSessionHeader(req) ||
      parseQrSessionAuthValue(String(body.sessionAuth || '')) ||
      parseQrSessionCookie(req)
    const { session, rawSecret } = await claimQrTableSession({
      token,
      existingSessionId: existingAuth?.sessionId,
      existingRawSecret: existingAuth?.rawSecret,
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
