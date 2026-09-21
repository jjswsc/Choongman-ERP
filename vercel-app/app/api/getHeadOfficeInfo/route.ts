import { NextRequest, NextResponse } from 'next/server'
import { fetchHeadOfficeVendorRow, toSettingsHeadOfficeInfo } from '@/lib/head-office-vendor'
import {
  isInventoryTenantQueryBlocked,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 본사 정보 조회 (인보이스/설정용) — Omni는 로그인한 회사(tenant)만 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(scope)) {
      return NextResponse.json(toSettingsHeadOfficeInfo(null, scope))
    }
    const row = await fetchHeadOfficeVendorRow(scope)
    return NextResponse.json(toSettingsHeadOfficeInfo(row, scope))
  } catch (e) {
    console.error('getHeadOfficeInfo:', e)
    return NextResponse.json(
      { companyName: '', taxId: '', address: '', phone: '', bankInfo: '' },
      { status: 500 }
    )
  }
}
