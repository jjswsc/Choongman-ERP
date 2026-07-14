import { NextRequest, NextResponse } from 'next/server'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import {
  buildStoreListFromEmployees,
  fetchErpStoresMaster,
  fetchErpStoresMasterForTenant,
  loadEmployeesForStoreList,
} from '@/lib/erp-store-master'
import { enrichStoreListWithGrabMap } from '@/lib/erp-store-list-grab-enrich'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'
import { getVerifiedAuth } from '@/lib/verify-auth'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return headers
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

/**
 * 매장·직원 목록 경량 조회 (store,name,nick)
 * — Omni SaaS: JWT tenantId 가 있으면 해당 테넌트 매장만 (타사 노출 방지)
 * — 충만 레거시 / 파트너(tenant 없음): 기존처럼 전체
 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders()

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantId = String(auth?.tenantId || '').trim()
    const companyName = String(auth?.company || '').trim()
    const scopeTenant =
      Boolean(tenantId) && !isLegacyChoongmanErpSupabase()

    const masters = scopeTenant
      ? await fetchErpStoresMasterForTenant(tenantId, companyName)
      : await fetchErpStoresMaster()

    const empList = await loadEmployeesForStoreList(
      scopeTenant
        ? { tenantId, companyName, masters }
        : undefined
    )

    const built = enrichStoreListWithGrabMap(buildStoreListFromEmployees(empList, masters), masters)

    const operationalStores = filterPosSalesStoreOptionsForManagement(built.stores)

    return NextResponse.json(
      {
        stores: operationalStores,
        /** POS 터미널·본사 시연(CM Office) 등 — 매장 검색/집계용 `stores`와 분리 */
        allStores: built.stores,
        users: built.users,
        staffByStore: built.staffByStore,
        storeLabels: built.storeLabels,
        legacyToCanonical: built.legacyToCanonical,
        usedMaster: built.usedMaster,
      },
      { headers }
    )
  } catch (e) {
    console.error('getStoreList:', e)
    return NextResponse.json(
      {
        stores: [],
        allStores: [],
        users: {},
        staffByStore: {},
        storeLabels: {},
        legacyToCanonical: {},
        usedMaster: false,
      },
      { headers }
    )
  }
}
