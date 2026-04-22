import { NextRequest, NextResponse } from 'next/server'
import { assertCanWriteAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseUpsertMerge } from '@/lib/supabase-server'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import { requireAuth } from '@/lib/verify-auth'

function cleanText(v: unknown, max = 500): string {
  return String(v || '').trim().slice(0, max)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  let auditRole = ''
  let auditActor = ''
  let auditYear: unknown = null
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const userRole = cleanText(auth.role, 120)
    const actor = cleanText(auth.name || body.updatedBy, 200)
    auditRole = userRole
    auditActor = actor
    auditYear = body.year
    assertCanWriteAccountingCompliance(userRole)

    const year = Number(body.year)
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      await writeAccountingComplianceAudit({
        actionType: 'kt20k_settings_save',
        userRole,
        actor,
        decision: 'deny',
        reasonCode: 'INVALID_YEAR',
        targetType: 'kt20k_settings',
      })
      return NextResponse.json({ success: false, error: 'INVALID_YEAR' }, { status: 400, headers })
    }

    const businessCode5Raw = cleanText(body.businessCode5, 20).replace(/\D/g, '')
    const businessCode5 = businessCode5Raw ? businessCode5Raw.slice(0, 5) : ''
    const fundRateRaw = cleanText(body.fundRatePercent, 32)
    const fundRateNum = fundRateRaw === '' ? null : Number(fundRateRaw)
    if (
      fundRateRaw !== '' &&
      (fundRateNum == null || !Number.isFinite(fundRateNum) || fundRateNum < 0 || fundRateNum > 100)
    ) {
      await writeAccountingComplianceAudit({
        actionType: 'kt20k_settings_save',
        userRole,
        actor,
        decision: 'deny',
        reasonCode: 'INVALID_FUND_RATE',
        targetType: 'kt20k_settings',
      })
      return NextResponse.json(
        { success: false, error: 'INVALID_FUND_RATE' },
        { status: 400, headers }
      )
    }

    const row = {
      effective_year: Math.floor(year),
      company_tax_id: cleanText(body.companyTaxId, 32).replace(/[^\d]/g, ''),
      company_name: cleanText(body.companyName, 500),
      sso_office_province: cleanText(body.ssoOfficeProvince, 200),
      sso_office_phone: cleanText(body.ssoOfficePhone, 64),
      business_code_5: businessCode5,
      fund_rate_percent: fundRateNum,
      updated_by: actor,
      updated_at: new Date().toISOString(),
    }

    await supabaseUpsertMerge('thai_workers_comp_settings', 'effective_year', row)
    await writeAccountingComplianceAudit({
      actionType: 'kt20k_settings_save',
      userRole,
      actor: row.updated_by || null,
      decision: 'allow',
      reasonCode: 'UPSERTED',
      targetType: 'kt20k_settings',
      targetId: String(row.effective_year),
      payload: {
        companyTaxId: row.company_tax_id || null,
        businessCode5: row.business_code_5 || null,
      },
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      try {
        await writeAccountingComplianceAudit({
          actionType: 'kt20k_settings_save',
          userRole: auditRole,
          actor: auditActor || null,
          decision: 'deny',
          reasonCode: 'FORBIDDEN_WRITE',
          targetType: 'kt20k_settings',
          targetId: auditYear != null ? String(auditYear) : null,
        })
      } catch {}
      return NextResponse.json({ success: false, error: 'FORBIDDEN_WRITE' }, { status: 403, headers })
    }
    console.error('saveKt20kSettings:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

