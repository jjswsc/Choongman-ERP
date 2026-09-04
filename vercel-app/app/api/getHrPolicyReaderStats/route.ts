import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { selectHrPoliciesList } from '@/lib/hr-policies-select'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { aggregateHrPolicyReadStats, type HrPolicyForAggregation } from '@/lib/hr-policy-read-aggregation'
import type { EmpRow } from '@/lib/notice-read-aggregation'

const POLICY_READ_STATS_LIMIT = 1200
const IN_CHUNK = 60

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function isStoreAllowedForAuth(
  store: string,
  auth: { store?: string; allowedStores?: string[] },
  isOffice: boolean
): boolean {
  if (isOffice) return true
  const u = String(auth.store || '').trim()
  const more = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const cands = new Set([u, ...more])
  for (const a of cands) {
    if (storesMatchForGradeLookup(a, store)) return true
  }
  return false
}

export const dynamic = 'force-dynamic'

/**
 * GET 기간별 — 수신 대상이었던 인사 규정(생성일 기준)에 대한 미열람(현재 content_version) 직원
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    const er = authRes.errorResponse
    er.headers.set('Access-Control-Allow-Origin', '*')
    return er
  }
  const auth = authRes.auth

  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const storeFilter = String(searchParams.get('store') || '전체').trim() || '전체'
  const minMissed = Math.max(1, Math.floor(Number(searchParams.get('minMissed') || 1) || 1))

  if (!startStr || !endStr) {
    return NextResponse.json(
      { success: false, message: '시작일·종료일이 필요합니다.', items: [] },
      { status: 400, headers }
    )
  }

  const userRole = (auth.role || '').toLowerCase()
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)

  try {
    let filter = 'id=gte.0'
    filter += `&created_at=gte.${startStr}`
    const endPlus = endStr + 'T23:59:59.999Z'
    filter += `&created_at=lte.${endPlus}`

    const policyRows = (await selectHrPoliciesList(filter, {
      order: 'created_at.desc',
      limit: POLICY_READ_STATS_LIMIT,
    })) as (HrPolicyForAggregation & { created_at?: string })[]

    const truncated = (policyRows || []).length >= POLICY_READ_STATS_LIMIT
    const policies = (policyRows || []) as HrPolicyForAggregation[]

    const empListRaw = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name,job,role,resign_date',
    })) as { store?: string; name?: string; job?: string; role?: string; resign_date?: string }[]

    const employees: EmpRow[] = (empListRaw || [])
      .map((e) => ({
        store: String(e.store || '').trim(),
        name: String(e.name || '').trim(),
        job: String(e.job || e.role || '').trim(),
        role: String(e.role || '').trim(),
        resignDate: String(e.resign_date || '').trim(),
      }))
      .filter((e) => e.name)

    const policyIds = policies.map((p) => p.id)
    const readRows: { policy_id: number; store?: string; name?: string; status?: string; acknowledged_version?: number }[] = []
    for (const part of chunk(policyIds, IN_CHUNK)) {
      if (part.length === 0) continue
      const rows = (await supabaseSelectFilter(
        'hr_policy_reads',
        `policy_id=in.(${part.join(',')})`,
        { limit: 50000, select: 'policy_id,store,name,status,acknowledged_version' }
      )) as { policy_id: number; store?: string; name?: string; status?: string; acknowledged_version?: number }[]
      readRows.push(...(rows || []))
    }

    const agg = aggregateHrPolicyReadStats(policies, employees, readRows)

    const items: {
      store: string
      name: string
      job: string
      targeted: number
      confirmed: number
      missed: number
      missRate: number
    }[] = []

    for (const a of agg.values()) {
      if (!isStoreAllowedForAuth(a.store, auth, isOffice)) continue
      if (storeFilter && storeFilter !== '전체' && storeFilter !== 'All') {
        if (a.store !== storeFilter && !storesMatchForGradeLookup(storeFilter, a.store)) continue
      }
      const missed = a.targeted - a.confirmed
      if (missed < minMissed) continue
      const missRate = a.targeted > 0 ? Math.round((1000 * missed) / a.targeted) / 10 : 0
      items.push({
        store: a.store,
        name: a.name,
        job: a.job,
        targeted: a.targeted,
        confirmed: a.confirmed,
        missed,
        missRate,
      })
    }

    items.sort((x, y) => {
      if (y.missed !== x.missed) return y.missed - x.missed
      if (y.missRate !== x.missRate) return y.missRate - x.missRate
      if (x.store !== y.store) return x.store.localeCompare(y.store)
      return x.name.localeCompare(y.name)
    })

    return NextResponse.json(
      { success: true, items, truncated, policyInRange: policyIds.length },
      { headers }
    )
  } catch (e) {
    console.error('getHrPolicyReaderStats:', e)
    return NextResponse.json(
      {
        success: false,
        message: '집계 실패: ' + (e instanceof Error ? e.message : String(e)),
        items: [] as never[],
        truncated: false,
        policyInRange: 0,
      },
      { status: 500, headers }
    )
  }
}
