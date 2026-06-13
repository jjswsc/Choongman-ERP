import 'server-only'

import { bangkokInclusivePeriod, bangkokTodayYmd, bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { resolveMemberPortalStoreDisplayName } from '@/lib/member-portal-store-display'
import {
  isMemberPortalPublicStore,
  memberPortalStoresFromMasters,
  type MemberPortalStoreDto,
} from '@/lib/member-portal-stores-shared'
import { hasOfficeStaffScope } from '@/lib/permissions'
import {
  supabaseRpc,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsertMerge,
} from '@/lib/supabase-server'

/** 회원앱 가입 — 온라인(본사·오피스) 선택 값 */
export const MEMBER_SIGNUP_OFFICE_STORE_CODE = 'office'

export const MEMBER_SIGNUP_UNSET_STORE_CODE = '__unset__'

export type MemberSignupStoreOption = Pick<
  MemberPortalStoreDto,
  'storeCode' | 'displayName' | 'displayNameKo' | 'displayNameEn' | 'displayNameTh'
>

export type MemberSignupStoreStatRow = {
  storeCode: string
  displayName: string
  signupCount: number
  sharePct: number
  targetCount: number
  achievementPct: number
}

export type MemberSignupStoreStats = {
  days: number | null
  startYmd: string
  endYmd: string
  monthYmd: string
  totalSignups: number
  scopedStoreCode: string | null
  rows: MemberSignupStoreStatRow[]
}

export type MemberSignupStoreGoalRow = {
  storeCode: string
  displayName: string
  targetCount: number
}

export type MemberSignupStoreScope = {
  allStores: boolean
  storeCode: string | null
  canEditGoals: boolean
}

export function resolveMemberSignupStoreScope(role: string, authStore?: string): MemberSignupStoreScope {
  const allStores = hasOfficeStaffScope(role, authStore)
  if (allStores) {
    return { allStores: true, storeCode: null, canEditGoals: true }
  }
  return { allStores: false, storeCode: String(authStore || '').trim() || null, canEditGoals: false }
}

export async function resolveAuthStoreToSignupStoreCode(authStore: string): Promise<string | null> {
  const raw = String(authStore || '').trim()
  if (!raw) return null
  if (raw === MEMBER_SIGNUP_OFFICE_STORE_CODE) return raw
  const rows = await fetchErpStoresMaster()
  for (const row of rows) {
    const code = String(row.store_code || '').trim()
    if (!code) continue
    if (
      storesMatchForGradeLookup(raw, code) ||
      storesMatchForGradeLookup(raw, String(row.display_name || ''))
    ) {
      return code
    }
  }
  return raw
}

export async function filterSignupStoreCodeForScope(
  storeCode: string,
  scope: MemberSignupStoreScope
): Promise<boolean> {
  if (scope.allStores) return true
  const scoped = scope.storeCode
  if (!scoped) return false
  const canonicalScoped = (await resolveAuthStoreToSignupStoreCode(scoped)) || scoped
  if (storeCode === canonicalScoped) return true
  return storesMatchForGradeLookup(canonicalScoped, storeCode)
}

export async function listMemberSignupStoreOptions(lang = 'ko'): Promise<MemberSignupStoreOption[]> {
  const rows = await fetchErpStoresMaster()
  const stores = memberPortalStoresFromMasters(rows, {
    orderStoreFilter: isMemberPortalPublicStore,
  })
  return stores.map((s) => ({
    storeCode: s.storeCode,
    displayName: resolveMemberPortalStoreDisplayName(s, lang),
    displayNameKo: s.displayNameKo,
    displayNameEn: s.displayNameEn,
    displayNameTh: s.displayNameTh,
  }))
}

export async function buildMemberSignupStoreLabelMap(lang = 'ko'): Promise<Map<string, string>> {
  const options = await listMemberSignupStoreOptions(lang)
  const map = new Map<string, string>()
  map.set(MEMBER_SIGNUP_OFFICE_STORE_CODE, resolveOfficeSignupStoreLabel(lang))
  map.set(MEMBER_SIGNUP_UNSET_STORE_CODE, resolveUnsetSignupStoreLabel(lang))
  for (const s of options) {
    map.set(s.storeCode, s.displayName)
  }
  return map
}

export function resolveOfficeSignupStoreLabel(lang = 'ko'): string {
  const l = String(lang || 'ko').toLowerCase()
  if (l === 'en') return 'Online (Office)'
  if (l === 'th') return 'ออนไลน์ (สำนักงาน)'
  return '온라인 (Office)'
}

export function resolveUnsetSignupStoreLabel(lang = 'ko'): string {
  const l = String(lang || 'ko').toLowerCase()
  if (l === 'en') return '(Unset)'
  if (l === 'th') return '(ไม่ระบุ)'
  return '(미지정)'
}

export async function isAllowedMemberSignupStoreCode(storeCode: string): Promise<boolean> {
  const code = String(storeCode || '').trim()
  if (!code) return false
  if (code === MEMBER_SIGNUP_OFFICE_STORE_CODE) return true
  const options = await listMemberSignupStoreOptions()
  return options.some((s) => s.storeCode === code)
}

function monthYmdFromEndDate(endYmd: string): string {
  const end = String(endYmd || '').trim()
  return end.length >= 7 ? end.slice(0, 7) : bangkokTodayYmd().slice(0, 7)
}

async function loadSignupStoreStatsFallback(
  gteIso: string,
  lteIso: string
): Promise<Array<{ join_store_code: string; signup_count: number }>> {
  const rows = (await supabaseSelectFilter(
    'members',
    `created_at=gte.${encodeURIComponent(gteIso)}&created_at=lte.${encodeURIComponent(lteIso)}&or=(source.eq.app,source.eq.line)`,
    {
      limit: 50000,
      select: 'join_store_code,source',
    }
  )) as Array<{ join_store_code?: string | null; source?: string | null }>

  const counts = new Map<string, number>()
  for (const row of rows || []) {
    const source = String(row.source || '').trim()
    if (source !== 'app' && source !== 'line') continue
    const code = String(row.join_store_code || '').trim() || MEMBER_SIGNUP_UNSET_STORE_CODE
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([join_store_code, signup_count]) => ({ join_store_code, signup_count }))
    .sort((a, b) => b.signup_count - a.signup_count || a.join_store_code.localeCompare(b.join_store_code, 'ko'))
}

async function loadSignupStoreGoals(monthYmd: string): Promise<Map<string, number>> {
  const month = String(monthYmd || '').trim()
  const map = new Map<string, number>()
  if (!month) return map
  try {
    const rows = (await supabaseSelectFilter(
      'member_signup_store_goals',
      `month_ymd=eq.${encodeURIComponent(month)}`,
      { limit: 500, select: 'store_code,target_count' }
    )) as Array<{ store_code?: string | null; target_count?: number | null }>
    for (const row of rows || []) {
      const code = String(row.store_code || '').trim()
      if (!code) continue
      map.set(code, Math.max(0, Math.trunc(Number(row.target_count || 0))))
    }
  } catch {
    /* table may not exist yet */
  }
  return map
}

export async function saveMemberSignupStoreGoals(params: {
  monthYmd: string
  goals: Array<{ storeCode: string; targetCount: number }>
}): Promise<void> {
  const monthYmd = String(params.monthYmd || '').trim()
  if (!/^\d{4}-\d{2}$/.test(monthYmd)) throw new Error('invalid_month')
  const now = getBangkokDateTimeString()
  for (const goal of params.goals || []) {
    const storeCode = String(goal.storeCode || '').trim()
    if (!storeCode) continue
    if (!(await isAllowedMemberSignupStoreCode(storeCode))) continue
    const targetCount = Math.max(0, Math.trunc(Number(goal.targetCount || 0)))
    await supabaseUpsertMerge('member_signup_store_goals', 'store_code,month_ymd', {
      store_code: storeCode,
      month_ymd: monthYmd,
      target_count: targetCount,
      updated_at: now,
      created_at: now,
    })
  }
}

export async function loadMemberSignupStoreGoals(params: {
  monthYmd: string
  lang?: string
  scope?: MemberSignupStoreScope
}): Promise<MemberSignupStoreGoalRow[]> {
  const monthYmd = String(params.monthYmd || '').trim()
  const lang = String(params.lang || 'ko')
  const scope = params.scope || { allStores: true, storeCode: null, canEditGoals: true }
  const labelMap = await buildMemberSignupStoreLabelMap(lang)
  const goalMap = await loadSignupStoreGoals(monthYmd)
  const storeOptions = await listMemberSignupStoreOptions(lang)
  const rows: MemberSignupStoreGoalRow[] = [
    {
      storeCode: MEMBER_SIGNUP_OFFICE_STORE_CODE,
      displayName: labelMap.get(MEMBER_SIGNUP_OFFICE_STORE_CODE) || resolveOfficeSignupStoreLabel(lang),
      targetCount: goalMap.get(MEMBER_SIGNUP_OFFICE_STORE_CODE) || 0,
    },
    ...storeOptions.map((s) => ({
      storeCode: s.storeCode,
      displayName: s.displayName,
      targetCount: goalMap.get(s.storeCode) || 0,
    })),
  ]
  if (scope.allStores) return rows
  const filtered: MemberSignupStoreGoalRow[] = []
  for (const row of rows) {
    if (await filterSignupStoreCodeForScope(row.storeCode, scope)) filtered.push(row)
  }
  return filtered
}

function resolveStatsPeriod(params?: {
  days?: number
  startYmd?: string
  endYmd?: string
}): { startYmd: string; endYmd: string; days: number | null } {
  const customStart = String(params?.startYmd || '').trim()
  const customEnd = String(params?.endYmd || '').trim()
  if (customStart && customEnd) {
    return { startYmd: customStart, endYmd: customEnd, days: null }
  }
  const span = Math.min(365, Math.max(1, Math.trunc(Number(params?.days || 30))))
  const endYmd = bangkokTodayYmd()
  const { startYmd } = bangkokInclusivePeriod(endYmd, span)
  return { startYmd, endYmd, days: span }
}

export async function loadMemberSignupStoreStats(params?: {
  days?: number
  startYmd?: string
  endYmd?: string
  lang?: string
  scope?: MemberSignupStoreScope
}): Promise<MemberSignupStoreStats> {
  const lang = String(params?.lang || 'ko')
  const scope = params?.scope || { allStores: true, storeCode: null, canEditGoals: true }
  const { startYmd, endYmd, days } = resolveStatsPeriod(params)
  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startYmd, endYmd)
  const monthYmd = monthYmdFromEndDate(endYmd)

  let rawRows: Array<{ join_store_code?: string | null; signup_count?: number | null }> = []
  try {
    rawRows = (await supabaseRpc<Array<{ join_store_code?: string | null; signup_count?: number | null }>>(
      'get_member_signup_store_stats',
      { p_from: gteIso, p_to: lteIso }
    )) as Array<{ join_store_code?: string | null; signup_count?: number | null }>
  } catch {
    rawRows = await loadSignupStoreStatsFallback(gteIso, lteIso)
  }

  const labelMap = await buildMemberSignupStoreLabelMap(lang)
  const goalMap = await loadSignupStoreGoals(monthYmd)
  let rows: MemberSignupStoreStatRow[] = (rawRows || []).map((row) => {
    const storeCode = String(row.join_store_code || '').trim() || MEMBER_SIGNUP_UNSET_STORE_CODE
    const signupCount = Math.max(0, Number(row.signup_count || 0))
    const targetCount = goalMap.get(storeCode) || 0
    const achievementPct =
      targetCount > 0 ? Math.round((signupCount / targetCount) * 1000) / 10 : signupCount > 0 ? 100 : 0
    return {
      storeCode,
      displayName: labelMap.get(storeCode) || storeCode,
      signupCount,
      sharePct: 0,
      targetCount,
      achievementPct,
    }
  })

  if (!scope.allStores) {
    const filtered: MemberSignupStoreStatRow[] = []
    for (const row of rows) {
      if (await filterSignupStoreCodeForScope(row.storeCode, scope)) filtered.push(row)
    }
    rows = filtered
  }

  const totalSignups = rows.reduce((sum, row) => sum + row.signupCount, 0)
  rows = rows.map((row) => ({
    ...row,
    sharePct: totalSignups > 0 ? Math.round((row.signupCount / totalSignups) * 1000) / 10 : 0,
  }))

  const scopedStoreCode = scope.allStores
    ? null
    : (await resolveAuthStoreToSignupStoreCode(scope.storeCode || '')) || scope.storeCode

  return {
    days,
    startYmd,
    endYmd,
    monthYmd,
    totalSignups,
    scopedStoreCode,
    rows,
  }
}

export function memberSignupStoreStatsToCsv(stats: MemberSignupStoreStats): string {
  const header = ['store_code', 'store_name', 'signup_count', 'share_pct', 'target_count', 'achievement_pct']
  const lines = [header.join(',')]
  for (const row of stats.rows) {
    lines.push(
      [
        csvCell(row.storeCode),
        csvCell(row.displayName),
        String(row.signupCount),
        String(row.sharePct),
        String(row.targetCount),
        String(row.achievementPct),
      ].join(',')
    )
  }
  lines.push(['TOTAL', '', String(stats.totalSignups), '100', '', ''].join(','))
  return `\uFEFF${lines.join('\n')}`
}

function csvCell(value: string): string {
  const raw = String(value || '')
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

export async function setMemberJoinStoreCodeOnce(params: {
  memberId: number
  joinStoreCode: string
}): Promise<void> {
  const memberId = Number(params.memberId || 0)
  const joinStoreCode = String(params.joinStoreCode || '').trim()
  if (!memberId) throw new Error('member_required')
  if (!(await isAllowedMemberSignupStoreCode(joinStoreCode))) throw new Error('invalid_store')

  const rows = (await supabaseSelectFilter('members', `id=eq.${memberId}`, {
    limit: 1,
    select: 'id,join_store_code',
  })) as Array<{ id?: number; join_store_code?: string | null }>
  const row = rows?.[0]
  if (!row?.id) throw new Error('member_not_found')
  if (String(row.join_store_code || '').trim()) throw new Error('join_store_already_set')

  await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
    join_store_code: joinStoreCode,
    updated_at: getBangkokDateTimeString(),
  })
}
