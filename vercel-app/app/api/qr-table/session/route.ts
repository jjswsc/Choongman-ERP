import { NextRequest } from 'next/server'
import { getPublicSessionBootstrap } from '@/lib/qr-table-server'
import { mapQrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function GET(req: NextRequest) {
  try {
    const token = String(req.nextUrl.searchParams.get('token') || '').trim()
    if (!token) return qrJson({ success: false, message: 'token_required' }, 400)
    const origin = req.nextUrl.origin
    const data = await getPublicSessionBootstrap(token, origin)
    return qrJson({ success: true, ...data })
  } catch (e) {
    return mapQrError(e)
  }
}
