import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import type { JwtPayload } from '@/lib/jwt-auth'
import { authCanAccessPosStoreWrite } from '@/lib/pos-store-access-server'
import { requireAuth } from '@/lib/verify-auth'

export function posApiCorsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

export function applyPosApiCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*')
  return res
}

export function extractPosStoreCodeFromBody(body: Record<string, unknown>): string {
  return String(body.storeCode ?? body.store_code ?? body.store ?? '').trim()
}

export type PosStoreWriteAuthResult =
  | { ok: true; auth: JwtPayload }
  | { ok: false; response: NextResponse }

export async function requirePosStoreWriteAuth(
  req: NextRequest,
  storeCode: string,
  headers?: Headers
): Promise<PosStoreWriteAuthResult> {
  const h = headers ?? posApiCorsHeaders()
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) {
    return { ok: false, response: applyPosApiCors(authResult.errorResponse) }
  }
  const auth = authResult.auth!
  const target = String(storeCode || '').trim()
  if (!target) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: '매장(storeCode)이 필요합니다.' },
        { status: 400, headers: h }
      ),
    }
  }
  if (!(await authCanAccessPosStoreWrite(auth, target))) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
        { status: 403, headers: h }
      ),
    }
  }
  return { ok: true, auth }
}

/** 주문 ID로 매장을 조회한 뒤 POS 쓰기 권한 검사 */
export async function requirePosOrderWriteAuth(
  req: NextRequest,
  orderId: number,
  headers?: Headers
): Promise<PosStoreWriteAuthResult> {
  const h = headers ?? posApiCorsHeaders()
  const id = Math.floor(Number(orderId))
  if (!id) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: '주문 ID가 필요합니다.' },
        { status: 400, headers: h }
      ),
    }
  }
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) {
    return { ok: false, response: applyPosApiCors(authResult.errorResponse) }
  }
  const auth = authResult.auth!
  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${id}`, {
    limit: 1,
    select: 'store_code',
  })) as { store_code?: string }[] | null
  const storeCode = String(rows?.[0]?.store_code ?? '').trim()
  if (!storeCode) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: '주문을 찾을 수 없습니다.' },
        { status: 404, headers: h }
      ),
    }
  }
  if (!(await authCanAccessPosStoreWrite(auth, storeCode))) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: '해당 매장에 대한 권한이 없습니다.' },
        { status: 403, headers: h }
      ),
    }
  }
  return { ok: true, auth }
}
