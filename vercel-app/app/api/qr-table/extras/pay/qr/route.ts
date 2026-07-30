import { NextRequest } from 'next/server'
import { issueExtrasPayQr, requireQrGuestSession } from '@/lib/qr-table-server'
import { resolveQrSessionAuth } from '@/lib/qr-table-session-auth'
import { mapQrError, qrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function POST(req: NextRequest) {
  try {
    const auth = resolveQrSessionAuth(req)
    if (!auth) return qrError('session_required', 401)
    await requireQrGuestSession(auth.sessionId, auth.rawSecret)
    const result = await issueExtrasPayQr(auth.sessionId)
    return qrJson({ success: true, ...result })
  } catch (e) {
    return mapQrError(e)
  }
}
