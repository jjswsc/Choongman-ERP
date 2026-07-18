import { NextRequest, NextResponse } from 'next/server'
import { computeIngredientUsageVariance } from '@/lib/ingredient-usage-variance'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { isManagerOrFranchiseeRole, isOfficeRole } from '@/lib/permissions'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const auth = await getVerifiedAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: '인증이 필요합니다.', rows: [] }, { status: 401, headers })
  }

  const role = String(auth.role || '')
  if (!isOfficeRole(role) && !isManagerOrFranchiseeRole(role)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.', rows: [] }, { status: 403, headers })
  }

  const { searchParams } = new URL(request.url)
  let store = String(searchParams.get('store') || searchParams.get('storeName') || '').trim()
  const startYmd = String(searchParams.get('startYmd') || searchParams.get('startStr') || '').trim()
  const endYmd = String(searchParams.get('endYmd') || searchParams.get('endStr') || '').trim()

  const isManager = isManagerOrFranchiseeRole(role)
  const userStore = String(auth.store || '').trim()
  if (isManager && userStore) {
    if (!store) store = userStore
    const storeNorm = store.toLowerCase().trim()
    const userNorm = userStore.toLowerCase().trim()
    const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
    if (!matches) {
      return NextResponse.json(
        { success: false, message: 'forbidden store', rows: [], startYmd, endYmd, store },
        { status: 403, headers }
      )
    }
    store = userStore
  }

  try {
    const data = await computeIngredientUsageVariance({
      store,
      startYmd,
      endYmd,
      request,
      auth: { role: auth.role, store: auth.store, tenantId: auth.tenantId },
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getIngredientUsageVariance:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : String(e),
        rows: [],
        startYmd,
        endYmd,
        store,
      },
      { status: 500, headers }
    )
  }
}
