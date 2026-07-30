import { NextRequest } from 'next/server'
import { requestStaffCall, requireQrGuestSession } from '@/lib/qr-table-server'
import { resolveQrSessionAuth } from '@/lib/qr-table-session-auth'
import { mapQrError, qrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function POST(req: NextRequest) {
  try {
    const auth = resolveQrSessionAuth(req)
    if (!auth) return qrError('session_required', 401)
    const session = await requireQrGuestSession(auth.sessionId, auth.rawSecret)
    const body = (await req.json().catch(() => ({}))) as { note?: string }
    const next = await requestStaffCall({ session, note: body.note })
    return qrJson({ success: true, session: next })
  } catch (e) {
    return mapQrError(e)
  }
}
