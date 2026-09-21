import { NextRequest, NextResponse } from 'next/server'
import {
  HQ_TENANT_UNIQUE_MESSAGE,
  upsertHeadOfficeVendor,
  type HeadOfficeSettingsInfo,
} from '@/lib/head-office-vendor'
import { resolveInventoryTenantScope } from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 본사 정보 저장 — Omni는 로그인한 회사(tenant)의 HQ 행만 수정 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getVerifiedAuth(req, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    const body = (await req.json()) as Partial<HeadOfficeSettingsInfo>
    const result = await upsertHeadOfficeVendor(scope, {
      companyName: String(body.companyName || ''),
      taxId: String(body.taxId || ''),
      address: String(body.address || ''),
      phone: String(body.phone || ''),
      bankInfo: String(body.bankInfo || ''),
    })
    return NextResponse.json({
      success: true,
      message: result.created ? '본사 정보가 등록되었습니다.' : '본사 정보가 수정되었습니다.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveHeadOfficeInfo:', msg)
    const known =
      msg === HQ_TENANT_UNIQUE_MESSAGE ||
      /tenant_id 스키마|회사\(테넌트\) 정보/i.test(msg)
    return NextResponse.json(
      { success: false, message: known ? msg : '저장 실패: ' + msg },
      { status: 500 }
    )
  }
}
