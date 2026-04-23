import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { canAccessSettings } from '@/lib/permissions'
import { normalizeFranchiseeMultiStoreSettings } from '@/lib/franchisee-multi-store'
import {
  getFranchiseeMultiStoreSettings,
  saveFranchiseeMultiStoreSettings,
} from '@/lib/franchisee-multi-store-settings-server'

/** 가맹점주 복수 매장 전역 설정 조회 (로그인한 관리자) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { auth, errorResponse } = await requireAuth(request, 'any')
  if (errorResponse) return errorResponse
  if (!auth) {
    return NextResponse.json({ success: false, message: '인증 필요' }, { status: 401, headers })
  }
  try {
    const settings = await getFranchiseeMultiStoreSettings()
    return NextResponse.json({ success: true, settings }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e instanceof Error ? e.message : e) },
      { status: 500, headers }
    )
  }
}

/** 저장: 본사 설정 권한(Director/Officer/CEO/HR)만 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { auth, errorResponse } = await requireAuth(request, 'any')
  if (errorResponse) return errorResponse
  if (!auth || !canAccessSettings(auth.role || '')) {
    return NextResponse.json({ success: false, message: '설정을 변경할 권한이 없습니다.' }, { status: 403, headers })
  }
  try {
    const body = (await request.json()) as { enabled?: boolean; maxStores?: number }
    const settings = normalizeFranchiseeMultiStoreSettings({
      enabled: body.enabled === true,
      maxStores: body.maxStores,
    })
    await saveFranchiseeMultiStoreSettings(settings)
    return NextResponse.json({ success: true, settings }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e instanceof Error ? e.message : e) },
      { status: 500, headers }
    )
  }
}
