import type { BroadcastTargetRow } from '@/lib/broadcast-notice-target'
import { parseTargetRecipientKeys } from '@/lib/broadcast-notice-target'
import { isOfficeStore } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import {
  formatBroadcastTargetSummary,
  hrPolicyMatchesAudienceFilter,
  type BroadcastTargetAudienceFilter,
  type BroadcastTargetSummaryLabels,
} from '@/lib/broadcast-target-selection'

const OFFICE_PERMISSION_KEYS = new Set(['director', 'ceo', 'hr', 'officer'])

export type HrPolicyAuthContext = {
  store?: string
  allowedStores?: string[]
  role?: string
}

export function resolveHrPolicyAllowedStores(auth: HrPolicyAuthContext): string[] {
  const userStore = String(auth.store || '').trim()
  const more = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
  const out = new Set<string>()
  if (userStore) out.add(userStore)
  for (const s of more) out.add(s)
  return Array.from(out)
}

function storeAllowedForAuth(store: string, allowed: string[]): boolean {
  const st = String(store || '').trim()
  if (!st) return false
  return allowed.some((a) => storesMatchForGradeLookup(a, st))
}

/**
 * 본사·회계: 전체 목록. 매장 매니저·가맹: 자기(허용) 매장과 겹치는 대상 규정만.
 */
export function hrPolicyVisibleToAuth(
  row: BroadcastTargetRow,
  auth: HrPolicyAuthContext,
  isOfficeLevel: boolean
): boolean {
  if (isOfficeLevel) return true
  const allowed = resolveHrPolicyAllowedStores(auth)
  if (allowed.length === 0) return false

  const recipients = parseTargetRecipientKeys(row.target_recipients)
  if (recipients.length > 0) {
    return recipients.some((r) => storeAllowedForAuth(r.store, allowed))
  }

  const ts = String(row.target_store || '전체').trim()
  const tp = String(row.target_permission_group || '').trim()
  const permList = tp
    ? tp
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : []

  const storeList =
    ts && ts !== '전체' && ts !== 'All'
      ? ts.split(',').map((s) => s.trim()).filter(Boolean)
      : []

  if (storeList.length > 0) {
    const overlapsAllowed = storeList.some((s) => storeAllowedForAuth(s, allowed))
    if (!overlapsAllowed) return false
    if (storeList.every((s) => isOfficeStore(s))) {
      return allowed.some((a) => isOfficeStore(a))
    }
    return true
  }

  // target_store 전체: 권한 그룹이 본사 전용만이면 매장 관리자 목록에서 제외
  if (permList.length > 0 && permList.every((p) => OFFICE_PERMISSION_KEYS.has(p))) {
    return allowed.some((a) => isOfficeStore(a))
  }

  return true
}

export function hrPolicyMatchesSearchKeyword(row: BroadcastTargetRow & { title?: string; content?: string }, q: string): boolean {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle) return true
  const title = String(row.title || '').toLowerCase()
  const content = String(row.content || '').toLowerCase()
  const ts = String(row.target_store || '').toLowerCase()
  const tr = String(row.target_role || '').toLowerCase()
  const tp = String(row.target_permission_group || '').toLowerCase()
  if (title.includes(needle) || content.includes(needle)) return true
  if (ts.includes(needle) || tr.includes(needle) || tp.includes(needle)) return true
  try {
    const raw = row.target_recipients
    if (raw && String(raw).toLowerCase().includes(needle)) return true
  } catch {
    /* */
  }
  return false
}

export function hrPolicyMatchesStoreFilter(
  row: BroadcastTargetRow,
  storeFilter: string,
  knownStoreNames: string[]
): boolean {
  const sf = String(storeFilter || '').trim()
  if (!sf || sf === '전체' || sf === 'All') return true

  const recipients = parseTargetRecipientKeys(row.target_recipients)
  if (recipients.length > 0) {
    return recipients.some((r) => storesMatchForGradeLookup(sf, r.store))
  }

  const ts = String(row.target_store || '전체').trim()
  if (!ts || ts === '전체' || ts === 'All') {
    return knownStoreNames.some((s) => storesMatchForGradeLookup(sf, s))
  }
  const storeList = ts.split(',').map((s) => s.trim()).filter(Boolean)
  return storeList.some((s) => storesMatchForGradeLookup(sf, s))
}

export function hrPolicyMatchesPermissionFilter(row: BroadcastTargetRow, permFilter: string): boolean {
  const pf = String(permFilter || '').trim().toLowerCase()
  if (!pf || pf === 'all' || pf === '전체') return true
  const tp = String(row.target_permission_group || '').trim()
  if (!tp) return false
  const list = tp
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(pf)
}

export type HrPolicyListQuery = {
  q?: string
  store?: string
  permissionGroup?: string
  audience?: BroadcastTargetAudienceFilter
}

export function filterHrPoliciesForList(
  rows: (BroadcastTargetRow & { title?: string; content?: string })[],
  auth: HrPolicyAuthContext,
  isOfficeLevel: boolean,
  query: HrPolicyListQuery,
  knownStoreNames: string[],
  summaryLabels: BroadcastTargetSummaryLabels
): (BroadcastTargetRow & { title?: string; content?: string; targetSummary?: string })[] {
  const audience = (query.audience || 'all') as BroadcastTargetAudienceFilter
  return rows
    .filter((row) => hrPolicyVisibleToAuth(row, auth, isOfficeLevel))
    .filter((row) => hrPolicyMatchesAudienceFilter(row, audience, knownStoreNames))
    .filter((row) => hrPolicyMatchesStoreFilter(row, query.store || '', knownStoreNames))
    .filter((row) => hrPolicyMatchesPermissionFilter(row, query.permissionGroup || ''))
    .filter((row) => hrPolicyMatchesSearchKeyword(row, query.q || ''))
    .map((row) => ({
      ...row,
      targetSummary: formatBroadcastTargetSummary(row, summaryLabels, knownStoreNames),
    }))
}
