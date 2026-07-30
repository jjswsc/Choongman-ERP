import { NextRequest } from 'next/server'
import { getGuestOrderSummary, requireQrGuestSession } from '@/lib/qr-table-server'
import { resolveQrSessionAuth } from '@/lib/qr-table-session-auth'
import { mapQrError, qrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function GET(req: NextRequest) {
  try {
    const auth = resolveQrSessionAuth(req)
    if (!auth) return qrError('session_required', 401)
    const session = await requireQrGuestSession(auth.sessionId, auth.rawSecret)
    const order = await getGuestOrderSummary(session)
    return qrJson({ success: true, session, order })
  } catch (e) {
    return mapQrError(e)
  }
}
