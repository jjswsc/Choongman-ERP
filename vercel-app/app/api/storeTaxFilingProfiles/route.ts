import { NextRequest, NextResponse } from 'next/server'
import {
  assertCanManageAccountingCompliance,
  assertCanWriteAccountingCompliance,
} from '@/lib/accounting-auth'
import {
  fetchStoreTaxFilingProfiles,
  isValidStoreTaxId,
  normalizeBranchNo,
  normalizeStoreTaxId,
  upsertStoreTaxFilingProfile,
} from '@/lib/store-tax-filing-profile'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { requireAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  return headers
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders()
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  try {
    assertCanManageAccountingCompliance(userRole, String(authResult.auth.store || ''))
  } catch {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  }

  try {
    const storeCode = String(new URL(request.url).searchParams.get('storeCode') || '').trim()
    if (storeCode) {
      const { resolveStoreTaxFilingProfile } = await import('@/lib/store-tax-filing-profile')
      const profile = await resolveStoreTaxFilingProfile(storeCode)
      return NextResponse.json({ profile }, { headers })
    }
    const profiles = await fetchStoreTaxFilingProfiles()
    return NextResponse.json({ profiles }, { headers })
  } catch (e) {
    console.error('storeTaxFilingProfiles GET:', e)
    return NextResponse.json({ profiles: [], tableMissing: true }, { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '').trim()
  const actor = String(auth.name || '').trim()

  try {
    assertCanWriteAccountingCompliance(userRole)
  } catch {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const storeCode = String(body.storeCode || body.store_code || '').trim()
    const taxpayerName = String(body.taxpayerName || body.taxpayer_name || '').trim()
    const taxId = normalizeStoreTaxId(body.taxId ?? body.tax_id)
    const branchNo = normalizeBranchNo(body.branchNo ?? body.branch_no)
    const placeOfBusiness = String(body.placeOfBusiness || body.place_of_business || '').trim()
    const ssoAccountNo = String(body.ssoAccountNo || body.sso_account_no || '').trim()
    const ssoBranchCode = String(body.ssoBranchCode || body.sso_branch_code || '').trim()
    const ssoOfficeAddress = String(body.ssoOfficeAddress || body.sso_office_address || '').trim()
    const ssoPostcode = String(body.ssoPostcode || body.sso_postcode || '').trim()
    const ssoPhone = String(body.ssoPhone || body.sso_phone || '').trim()
    const ssoFax = String(body.ssoFax || body.sso_fax || '').trim()
    const ssoEmail = String(body.ssoEmail || body.sso_email || '').trim()

    if (!storeCode) {
      return NextResponse.json({ error: 'INVALID_STORE_CODE' }, { status: 400, headers })
    }
    if (!taxpayerName) {
      return NextResponse.json({ error: 'TAXPAYER_NAME_REQUIRED' }, { status: 400, headers })
    }
    if (!isValidStoreTaxId(taxId)) {
      return NextResponse.json({ error: 'INVALID_TAX_ID' }, { status: 400, headers })
    }

    const profile = await upsertStoreTaxFilingProfile({
      storeCode,
      taxpayerName,
      taxId,
      branchNo,
      placeOfBusiness,
      ssoAccountNo,
      ssoBranchCode,
      ssoOfficeAddress,
      ssoPostcode,
      ssoPhone,
      ssoFax,
      ssoEmail,
      updatedBy: actor,
    })

    await writeAccountingComplianceAudit({
      actionType: 'store_tax_profile_save',
      userRole,
      actor,
      decision: 'allow',
      targetType: 'store_tax_filing_profile',
      targetId: profile.storeCode,
      payload: { taxIdLast4: taxId.slice(-4) },
    })

    return NextResponse.json({ success: true, profile }, { headers })
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('store_tax_filing_profiles') || msg.includes('42p01')) {
      return NextResponse.json(
        { error: 'TABLE_NOT_DEPLOYED', hint: 'Run sql/store_tax_filing_profiles.sql in Supabase' },
        { status: 503, headers }
      )
    }
    console.error('storeTaxFilingProfiles POST:', e)
    return NextResponse.json({ error: 'SAVE_FAILED' }, { status: 500, headers })
  }
}
