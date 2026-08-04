import { NextRequest } from 'next/server'
import { requireQrGuestSession, submitQrCart } from '@/lib/qr-table-server'
import { resolveQrSessionAuth } from '@/lib/qr-table-session-auth'
import type { QrCartLineInput } from '@/lib/qr-table-types'
import { mapQrError, qrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function POST(req: NextRequest) {
  try {
    const auth = resolveQrSessionAuth(req)
    if (!auth) return qrError('session_required', 401)
    const session = await requireQrGuestSession(auth.sessionId, auth.rawSecret)
    const body = (await req.json()) as { lines?: QrCartLineInput[] }
    // submitQrCart가 이미 갱신된 order summary를 반환 — 추가 getGuestOrderSummary 왕복 제거
    const result = await submitQrCart({ session, lines: body.lines || [] })
    return qrJson({ success: true, ...result })
  } catch (e) {
    return mapQrError(e)
  }
}
