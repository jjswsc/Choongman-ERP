import { NextResponse } from 'next/server'
import { applyQrTableCors, qrTableCorsHeaders } from '@/lib/qr-table-session-auth'

export function qrJson(data: unknown, status = 200, setCookie?: string): NextResponse {
  const headers = qrTableCorsHeaders()
  if (setCookie) headers.append('Set-Cookie', setCookie)
  return applyQrTableCors(NextResponse.json(data, { status, headers }))
}

export function qrError(message: string, status = 400): NextResponse {
  return qrJson({ success: false, message }, status)
}

export function mapQrError(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : 'error'
  const status =
    msg === 'invalid_token' || msg === 'session_not_found' || msg === 'tier_not_found' || msg === 'order_missing'
      ? 404
      : msg === 'session_forbidden' || msg === 'store_disabled'
        ? 403
        : msg === 'table_busy' || msg === 'already_paid' || msg === 'order_closed' || msg === 'session_device_limit'
          ? 409
          : msg === 'staff_open_required' ||
              msg === 'entry_not_ready' ||
              msg === 'entry_requires_prepay' ||
              msg === 'session_expired' ||
              msg === 'session_closed'
            ? 422
            : 400
  return qrError(msg, status)
}

export function qrOptions(): NextResponse {
  return applyQrTableCors(new NextResponse(null, { status: 204, headers: qrTableCorsHeaders() }))
}
