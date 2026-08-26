import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { lookupVendorNameByCode, resolveVendorCodeFromStore } from '@/lib/vendor-code-policy'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** 매장별 회사명 조회 (vendors gps_name 또는 name 일치, 없으면 본사) */
async function getStoreCompanyName(store: string): Promise<string> {
  const storeTrim = String(store || '').trim()
  if (!storeTrim) return ''
  const vendorCode = await resolveVendorCodeFromStore(storeTrim)
  if (vendorCode) {
    const linkedName = await lookupVendorNameByCode(vendorCode)
    if (linkedName) return linkedName
  }
  try {
    let rows = (await supabaseSelectFilter('vendors', `gps_name=eq.${encodeURIComponent(storeTrim)}`, { limit: 1 })) as { name?: string }[]
    if (!rows?.length && !storeTrim.match(/^CM\s+/i)) {
      rows = (await supabaseSelectFilter('vendors', `gps_name=eq.${encodeURIComponent('CM ' + storeTrim)}`, { limit: 1 })) as { name?: string }[]
    }
    if (!rows?.length && storeTrim.match(/^CM\s+/i)) {
      rows = (await supabaseSelectFilter('vendors', `gps_name=eq.${encodeURIComponent(storeTrim.replace(/^CM\s+/i, ''))}`, { limit: 1 })) as { name?: string }[]
    }
    if (rows?.length && rows[0]?.name) return String(rows[0].name).trim()
    rows = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent(storeTrim)}`, { limit: 1 })) as { name?: string }[]
    if (!rows?.length && !storeTrim.match(/^CM\s+/i)) {
      rows = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent('CM ' + storeTrim)}`, { limit: 1 })) as { name?: string }[]
    }
    if (!rows?.length && storeTrim.match(/^CM\s+/i)) {
      rows = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent(storeTrim.replace(/^CM\s+/i, ''))}`, { limit: 1 })) as { name?: string }[]
    }
    if (rows?.length && rows[0]?.name) return String(rows[0].name).trim()
    rows = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as { name?: string }[]
    if (!rows?.length) rows = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as { name?: string }[]
    return rows?.[0] ? String(rows[0].name || '').trim() : ''
  } catch {
    return ''
  }
}

/**
 * 본인 급여 명세서 조회 (store + name 일치)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  if (isSaasTenantQueryBlocked(tenantScope, 'payroll_records')) {
    return NextResponse.json({ success: true, data: null, msg: '' }, { headers })
  }

  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim().slice(0, 7)
  const userStore = String(auth.store || '').trim()
  const userName = String(auth.name || '').trim()
  const employeeIdFromAuth = Number((auth as { employeeId?: unknown }).employeeId)
  const employeeId = Number.isFinite(employeeIdFromAuth) && employeeIdFromAuth > 0
    ? Math.floor(employeeIdFromAuth)
    : 0

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json(
      { success: false, data: null, msg: '조회할 월(yyyy-MM)을 선택해주세요.' },
      { status: 400, headers }
    )
  }
  if (!userStore || !userName) {
    return NextResponse.json(
      { success: false, data: null, msg: '로그인 정보가 필요합니다.' },
      { status: 400, headers }
    )
  }

  try {
    let r: Record<string, unknown> | null = null
    if (employeeId > 0) {
      try {
        const byIdFilter = appendSaasTenantFilter(
          `month=eq.${encodeURIComponent(monthStr)}&store=eq.${encodeURIComponent(userStore)}&employee_id=eq.${employeeId}`,
          tenantScope,
          'payroll_records'
        )
        const byId = await supabaseSelectFilter('payroll_records', byIdFilter, {
          order: 'month.desc',
          limit: 1,
        })
        r = Array.isArray(byId) && byId.length > 0 ? (byId[0] as Record<string, unknown>) : null
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('payroll_records')
        if (!/employee_id|42703|column|tenant_id/i.test(em)) throw e
      }
    }
    if (!r) {
      const baseFilter = `month=eq.${encodeURIComponent(monthStr)}&store=eq.${encodeURIComponent(userStore)}&name=eq.${encodeURIComponent(userName)}`
      const filter = appendSaasTenantFilter(baseFilter, tenantScope, 'payroll_records')
      try {
        const rows = await supabaseSelectFilter('payroll_records', filter, {
          order: 'month.desc',
          limit: 1,
        })
        r = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('payroll_records')
          const rows = await supabaseSelectFilter('payroll_records', baseFilter, {
            order: 'month.desc',
            limit: 1,
          })
          r = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null
        } else {
          throw e
        }
      }
    }
    if (!r) {
      return NextResponse.json({ success: true, data: null, msg: '' }, { headers })
    }

    // 직원 앱: แจ้งประกาศ(published_at) 이후에만 노출. 컬럼 미배포 시에는 '대기'(임시저장)만 숨김.
    if (Object.prototype.hasOwnProperty.call(r, 'published_at')) {
      if (r.published_at == null || String(r.published_at).trim() === '') {
        return NextResponse.json({ success: true, data: null, msg: '' }, { headers })
      }
    } else if (String(r.status || '').trim() === '대기') {
      return NextResponse.json({ success: true, data: null, msg: '' }, { headers })
    }

    const storeName = String(r.store || '').trim()
    const companyName = await getStoreCompanyName(storeName)

    const data = {
      month: String(r.month || ''),
      store: storeName,
      name: String(r.name || ''),
      employee_id:
        r.employee_id != null && Number.isFinite(Number(r.employee_id)) && Number(r.employee_id) > 0
          ? Math.floor(Number(r.employee_id))
          : undefined,
      employee_code: String(r.employee_code || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5),
      dept: String(r.dept || ''),
      role: String(r.role || ''),
      companyName: companyName || undefined,
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.pos_allow) || 0,
      haz_allow: Number(r.haz_allow) || 0,
      diligence_allow: Number(r.diligence_allow) || 0,
      birth_bonus: Number(r.birth_bonus) || 0,
      holiday_pay: Number(r.holiday_pay) ?? 0,
      spl_bonus: Number(r.spl_bonus) || 0,
      ot_amt: Number(r.ot_amt) || 0,
      late_ded: Number(r.late_ded) || 0,
      early_ded: Number(r.early_ded) || 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.other_ded) || 0,
      net_pay: Number(r.net_pay) || 0,
      period_start: r.period_start ? String(r.period_start).slice(0, 10) : undefined,
      period_end: r.period_end ? String(r.period_end).slice(0, 10) : undefined,
      pay_date: r.pay_date ? String(r.pay_date).slice(0, 10) : undefined,
    }

    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    console.error('getMyPayroll:', e)
    return NextResponse.json(
      { success: false, data: null, msg: '급여 조회 중 오류가 발생했습니다.' },
      { status: 500, headers }
    )
  }
}
