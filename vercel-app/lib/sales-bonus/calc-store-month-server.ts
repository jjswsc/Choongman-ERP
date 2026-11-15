import { NextRequest } from 'next/server'
import { tryFetchPosSalesAnalyticsAggIgnoreTimeout } from '@/lib/pos-sales-analytics-rpc-server'
import { mapAnalyticsAggToStoreResults } from '@/lib/pos-sales-analytics-rpc-map'
import { canonicalSalesStoreRowKey } from '@/lib/pos-sales-store-filter'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { scheduleDateKey, toDateStrBangkok } from '@/lib/attendance-utils'
import { normalizeEmployeeNameForGradeMatch } from '@/lib/employee-display-name'
import { computePersonSalesBonus } from '@/lib/sales-bonus/compute-sales-bonus'
import {
  loadStoreSalesBonusSettings,
  loadStoreSalesBonusSettingsMap,
} from '@/lib/sales-bonus/load-store-settings-server'
import {
  resolveSalesBonusCalendarPeriod,
  type SalesBonusResolvedPeriod,
} from '@/lib/sales-bonus/period'
import type { SalesBonusPersonResult, StoreSalesBonusSettings } from '@/lib/sales-bonus/types'
import type { SaasTenantScope } from '@/lib/saas-tenant-scope'

export type SalesBonusPreviewEmployee = {
  employeeId: number
  employeeCode: string
  store: string
  name: string
  role: string
  absenceDays: number
  result: SalesBonusPersonResult
}

export type SalesBonusStorePreview = {
  storeCode: string
  settings: StoreSalesBonusSettings
  salesTotal: number
  period: Pick<SalesBonusResolvedPeriod, 'month' | 'start' | 'end' | 'payYmd' | 'payoutDay'>
  employees: SalesBonusPreviewEmployee[]
}

function empKey(store: string, name: string, employeeId?: number): string {
  const sid = employeeId != null && Number.isFinite(employeeId) && employeeId > 0 ? employeeId : 0
  if (sid > 0) return `${store}_#${sid}`
  return `${store}_${name}`
}

function toYmd(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  }
  return toDateStrBangkok(v as string | Date)
}

/** 매장 코드/별칭으로 매출 total 찾기 */
export function findStoreSalesTotal(
  salesByStore: { storeName: string; total: number }[],
  storeCode: string
): number {
  const want = canonicalSalesStoreRowKey(storeCode)
  const raw = String(storeCode || '').trim()
  for (const row of salesByStore) {
    const sn = String(row.storeName || '').trim()
    if (!sn) continue
    if (sn === raw || canonicalSalesStoreRowKey(sn) === want) return Number(row.total) || 0
  }
  return 0
}

export async function fetchPeriodStoreSalesTotals(params: {
  startStr: string
  endStr: string
  request?: NextRequest
  tenantScope?: SaasTenantScope | null
}): Promise<{ storeName: string; total: number }[]> {
  const rows = await tryFetchPosSalesAnalyticsAggIgnoreTimeout({
    startStr: params.startStr,
    endStr: params.endStr,
    aggMode: 'store',
    request: params.request,
    tenantScope: params.tenantScope ?? undefined,
  })
  if (!rows) return []
  return mapAnalyticsAggToStoreResults(rows).map((r) => ({
    storeName: r.storeName,
    total: r.total,
  }))
}

type AbsenceCtx = {
  scheduleDatesByKey: Record<string, Set<string>>
  presentDatesByKey: Record<string, Set<string>>
  paidLeaveDatesByKey: Record<string, Set<string>>
}

function addKeys(
  map: Record<string, Set<string>>,
  keys: string[],
  date: string
) {
  for (const k of keys) {
    if (!map[k]) map[k] = new Set()
    map[k].add(date)
  }
}

function lookupSet(
  map: Record<string, Set<string>>,
  keys: string[]
): Set<string> {
  const out = new Set<string>()
  for (const k of keys) {
    const s = map[k]
    if (!s) continue
    for (const d of s) out.add(d)
  }
  return out
}

async function buildAbsenceContext(params: {
  startStr: string
  endStr: string
  storeFilter?: string
}): Promise<AbsenceCtx> {
  const { startStr, endStr, storeFilter } = params
  const storeEq = storeFilter ? `&store_name=eq.${encodeURIComponent(storeFilter)}` : ''
  const storeLeaveEq = storeFilter ? `&store=eq.${encodeURIComponent(storeFilter)}` : ''

  const [scheduleRows, attRows, leaveRows] = await Promise.all([
    supabaseSelectFilterAllPages(
      'schedules',
      `schedule_date=gte.${startStr}&schedule_date=lte.${endStr}${storeEq}`,
      {
        order: 'schedule_date.asc',
        select: 'schedule_date,store_name,name,employee_id,plan_in,plan_out',
        pageSize: 1000,
      }
    ).catch(() => []) as Promise<
      {
        schedule_date?: string
        store_name?: string
        name?: string
        employee_id?: number
        plan_in?: string
        plan_out?: string
      }[]
    >,
    supabaseSelectFilterAllPages(
      'attendance_logs',
      `log_at=gte.${startStr}T00:00:00%2B07:00&log_at=lte.${endStr}T23:59:59%2B07:00${storeEq}`,
      {
        order: 'log_at.asc',
        select: 'log_at,store_name,name,employee_id,log_type',
        pageSize: 1000,
      }
    ).catch(() => []) as Promise<
      {
        log_at?: string
        store_name?: string
        name?: string
        employee_id?: number
        log_type?: string
      }[]
    >,
    supabaseSelectFilter(
      'leave_requests',
      `leave_date=gte.${startStr}&leave_date=lte.${endStr}&status=eq.${encodeURIComponent('승인')}${storeLeaveEq}`,
      {
        order: 'leave_date.asc',
        select: 'leave_date,store,name,employee_id,type,status',
        limit: 5000,
      }
    ).catch(() => []) as Promise<
      {
        leave_date?: string
        store?: string
        name?: string
        employee_id?: number
        type?: string
        status?: string
      }[]
    >,
  ])

  const scheduleDatesByKey: Record<string, Set<string>> = {}
  for (const s of scheduleRows || []) {
    const d = scheduleDateKey(s.schedule_date as string)
    const store = String(s.store_name || '').trim()
    const name = String(s.name || '').trim()
    const pIn = String(s.plan_in || '').trim()
    const pOut = String(s.plan_out || '').trim()
    if (!d || !store || !name || !pIn || !pOut) continue
    if (d < startStr || d > endStr) continue
    const sid =
      s.employee_id != null && Number.isFinite(Number(s.employee_id))
        ? Math.floor(Number(s.employee_id))
        : 0
    const nameNorm = normalizeEmployeeNameForGradeMatch(name)
    const keys = [`${store}_${name}`, empKey(store, name, sid)]
    if (sid > 0) keys.push(`${store}_#${sid}`)
    if (nameNorm && nameNorm !== name) keys.push(`${store}_${nameNorm}`)
    addKeys(scheduleDatesByKey, keys, d)
  }

  const presentDatesByKey: Record<string, Set<string>> = {}
  for (const a of attRows || []) {
    const d = toDateStrBangkok(a.log_at as string)
    const store = String(a.store_name || '').trim()
    const name = String(a.name || '').trim()
    if (!d || !store || !name) continue
    if (d < startStr || d > endStr) continue
    const sid =
      a.employee_id != null && Number.isFinite(Number(a.employee_id))
        ? Math.floor(Number(a.employee_id))
        : 0
    const nameNorm = normalizeEmployeeNameForGradeMatch(name)
    const keys = [`${store}_${name}`, empKey(store, name, sid)]
    if (sid > 0) keys.push(`${store}_#${sid}`)
    if (nameNorm && nameNorm !== name) keys.push(`${store}_${nameNorm}`)
    addKeys(presentDatesByKey, keys, d)
  }

  const paidLeaveDatesByKey: Record<string, Set<string>> = {}
  for (const lr of leaveRows || []) {
    const type = String(lr.type || '').trim()
    const isUnpaid = /무급|unpaid/i.test(type)
    if (isUnpaid) continue
    // 유급만 제외 (연차·반차·병가 등). 입사 1년 미만 세부는 급여 쪽과 동일하게 맞추지 않고 승인 유급으로 처리
    const isPaidLike = /연차|반차|병가|annual|half|sick|ลากิจ|lakij|유급|paid/i.test(type) || !isUnpaid
    if (!isPaidLike) continue
    const d = toYmd(lr.leave_date)
    const store = String(lr.store || '').trim()
    const name = String(lr.name || '').trim()
    if (!d || !store || !name) continue
    const sid =
      lr.employee_id != null && Number.isFinite(Number(lr.employee_id))
        ? Math.floor(Number(lr.employee_id))
        : 0
    const nameNorm = normalizeEmployeeNameForGradeMatch(name)
    const keys = [`${store}_${name}`, empKey(store, name, sid)]
    if (sid > 0) keys.push(`${store}_#${sid}`)
    if (nameNorm && nameNorm !== name) keys.push(`${store}_${nameNorm}`)
    addKeys(paidLeaveDatesByKey, keys, d)
  }

  return { scheduleDatesByKey, presentDatesByKey, paidLeaveDatesByKey }
}

/**
 * 스케줄 근무일 − 출근 − 유급휴가 = 결근일.
 * 출근 기록이 한 건도 없으면 0 (급여와 동일 가드).
 */
export function countSalesBonusAbsenceDays(params: {
  store: string
  name: string
  employeeId?: number
  joinDate?: string
  resignDate?: string
  startStr: string
  endStr: string
  ctx: AbsenceCtx
}): number {
  const store = String(params.store || '').trim()
  const name = String(params.name || '').trim()
  const sid = params.employeeId && params.employeeId > 0 ? params.employeeId : 0
  const nameNorm = normalizeEmployeeNameForGradeMatch(name)
  const keys = [`${store}_${name}`, empKey(store, name, sid)]
  if (sid > 0) keys.push(`${store}_#${sid}`)
  if (nameNorm && nameNorm !== name) keys.push(`${store}_${nameNorm}`)

  const schedule = lookupSet(params.ctx.scheduleDatesByKey, keys)
  const present = lookupSet(params.ctx.presentDatesByKey, keys)
  const paidLeave = lookupSet(params.ctx.paidLeaveDatesByKey, keys)

  if (present.size === 0) return 0

  const join = (params.joinDate || '').slice(0, 10)
  const resign = (params.resignDate || '').slice(0, 10)
  let n = 0
  for (const ds of schedule) {
    if (ds < params.startStr || ds > params.endStr) continue
    if (join && ds < join) continue
    if (resign && ds > resign) continue
    if (present.has(ds)) continue
    if (paidLeave.has(ds)) continue
    n += 1
  }
  return n
}

export async function calcSalesBonusPreviewForStores(params: {
  month: string
  storeCodes: string[]
  request?: NextRequest
  tenantScope?: SaasTenantScope | null
}): Promise<SalesBonusStorePreview[]> {
  const month = String(params.month || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month는 YYYY-MM 형식이어야 합니다.')

  const storeCodes = Array.from(
    new Set(params.storeCodes.map((s) => String(s || '').trim()).filter(Boolean))
  )
  if (storeCodes.length === 0) return []

  const settingsMap = await loadStoreSalesBonusSettingsMap(storeCodes)
  // 집계 기간은 달력월. 지급일은 매장 설정(없으면 5일) — 매출 구간은 매장마다 동일.
  const samplePayoutDay =
    storeCodes.map((c) => settingsMap.get(c)?.payoutDay).find((d) => d && d > 0) || 5
  const period = resolveSalesBonusCalendarPeriod(month, samplePayoutDay)
  const startStr = period.start
  const endStr = period.end

  const salesRows = await fetchPeriodStoreSalesTotals({
    startStr,
    endStr,
    request: params.request,
    tenantScope: params.tenantScope,
  })

  const out: SalesBonusStorePreview[] = []

  for (const storeCode of storeCodes) {
    const settings = settingsMap.get(storeCode) || (await loadStoreSalesBonusSettings(storeCode))
    const storePeriod = resolveSalesBonusCalendarPeriod(month, settings.payoutDay)
    const salesTotal = findStoreSalesTotal(salesRows, storeCode)
    const empFilter = `store=eq.${encodeURIComponent(storeCode)}`
    const empRows = (await supabaseSelectFilter('employees', empFilter, {
      order: 'name.asc',
      select: 'id,store,name,role,employee_code,join_date,resign_date',
      limit: 2000,
    }).catch(() => [])) as {
      id?: number
      store?: string
      name?: string
      role?: string
      employee_code?: string
      join_date?: string
      resign_date?: string
    }[]

    const activeEmps = (empRows || []).filter((e) => {
      const name = String(e.name || '').trim()
      if (!name) return false
      const resign = toYmd(e.resign_date)
      if (resign && resign < startStr) return false
      const join = toYmd(e.join_date)
      if (join && join > endStr) return false
      return true
    })

    const ctx = await buildAbsenceContext({
      startStr,
      endStr,
      storeFilter: storeCode,
    })

    const employees: SalesBonusPreviewEmployee[] = []
    for (const e of activeEmps) {
      const name = String(e.name || '').trim()
      const role = String(e.role || '').trim()
      const employeeId =
        e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
      const employeeCode = String(e.employee_code || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5)
      const absenceDays = countSalesBonusAbsenceDays({
        store: storeCode,
        name,
        employeeId,
        joinDate: toYmd(e.join_date),
        resignDate: toYmd(e.resign_date),
        startStr,
        endStr,
        ctx,
      })
      const result = computePersonSalesBonus({
        enabled: settings.enabled,
        salesTotal,
        tiers: settings.tiers,
        employeeId,
        doubleBonusEmployeeId: settings.doubleBonusEmployeeId,
        managerMultiplier: settings.managerMultiplier,
        staffMultiplier: settings.staffMultiplier,
        absenceDays,
        absencePenaltyPctPerDay: settings.absencePenaltyPctPerDay,
      })
      employees.push({
        employeeId,
        employeeCode,
        store: storeCode,
        name,
        role,
        absenceDays,
        result,
      })
    }

    employees.sort((a, b) => {
      const ad = a.result.isDoubleBonusDesignee ? 0 : 1
      const bd = b.result.isDoubleBonusDesignee ? 0 : 1
      if (ad !== bd) return ad - bd
      return a.name.localeCompare(b.name)
    })
    out.push({
      storeCode,
      settings,
      salesTotal,
      period: {
        month: storePeriod.month,
        start: storePeriod.start,
        end: storePeriod.end,
        payYmd: storePeriod.payYmd,
        payoutDay: storePeriod.payoutDay,
      },
      employees,
    })
  }

  return out
}

/** 급여 계산용: 매장별 매출·설정만 미리 로드 */
export async function loadSalesBonusContextForPayroll(params: {
  startStr: string
  endStr: string
  storeCodes: string[]
  request?: NextRequest
  tenantScope?: SaasTenantScope | null
}): Promise<{
  settingsByStore: Map<string, StoreSalesBonusSettings>
  salesByStore: Map<string, number>
}> {
  const storeCodes = Array.from(
    new Set(params.storeCodes.map((s) => String(s || '').trim()).filter(Boolean))
  )
  const [settingsByStore, salesRows] = await Promise.all([
    loadStoreSalesBonusSettingsMap(storeCodes),
    fetchPeriodStoreSalesTotals({
      startStr: params.startStr,
      endStr: params.endStr,
      request: params.request,
      tenantScope: params.tenantScope,
    }),
  ])
  const salesByStore = new Map<string, number>()
  for (const code of storeCodes) {
    salesByStore.set(code, findStoreSalesTotal(salesRows, code))
  }
  // 매출 행의 정식 코드도 넣어둠
  for (const row of salesRows) {
    const k = canonicalSalesStoreRowKey(row.storeName)
    if (k && !salesByStore.has(k)) salesByStore.set(k, row.total)
  }
  return { settingsByStore, salesByStore }
}

export function resolveSalesTotalForStore(
  salesByStore: Map<string, number>,
  store: string
): number {
  const raw = String(store || '').trim()
  if (!raw) return 0
  if (salesByStore.has(raw)) return salesByStore.get(raw) || 0
  const canon = canonicalSalesStoreRowKey(raw)
  if (salesByStore.has(canon)) return salesByStore.get(canon) || 0
  for (const [k, v] of salesByStore) {
    if (canonicalSalesStoreRowKey(k) === canon) return v
  }
  return 0
}
