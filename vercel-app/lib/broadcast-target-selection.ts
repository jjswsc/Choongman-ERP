import type { BroadcastTargetRow } from '@/lib/broadcast-notice-target'
import { isOfficeStore } from '@/lib/permissions'

export type BroadcastTargetPayload = {
  targetStore: string
  targetRole: string
  targetPermissionGroup: string
  targetRecipients?: Array<{ store: string; name: string }>
}

export type BroadcastTargetSelectionState = {
  selectedStores: string[]
  selectedPositions: string[]
  selectedPermissionGroups: string[]
  selectedRecipients: string[]
}

export function emptyBroadcastTargetSelection(): BroadcastTargetSelectionState {
  return {
    selectedStores: [],
    selectedPositions: [],
    selectedPermissionGroups: [],
    selectedRecipients: [],
  }
}

/** 공지·인사규정 저장 행 → 체크박스 상태 */
export function broadcastTargetStateFromRow(
  row: BroadcastTargetRow,
  allLabel: string
): BroadcastTargetSelectionState {
  const ts = String(row.target_store || '전체').trim()
  let selectedStores: string[] = []
  if (ts && ts !== '전체' && ts !== 'All') {
    selectedStores = ts.split(',').map((s) => s.trim()).filter(Boolean)
  }
  const tr = String(row.target_role || '전체').trim()
  let selectedPositions: string[] = []
  if (tr && tr !== '전체' && tr !== 'All') {
    selectedPositions = tr.split(',').map((s) => s.trim()).filter(Boolean)
  }
  const tp = String(row.target_permission_group || '').trim()
  let selectedPermissionGroups: string[] = []
  if (tp) {
    selectedPermissionGroups = tp.split(',').map((s) => s.trim()).filter(Boolean)
  }
  let selectedRecipients: string[] = []
  if (row.target_recipients) {
    try {
      const j = JSON.parse(String(row.target_recipients)) as unknown
      if (Array.isArray(j)) {
        selectedRecipients = j.filter((x): x is string => typeof x === 'string')
      }
    } catch {
      selectedRecipients = []
    }
  }
  void allLabel
  return { selectedStores, selectedPositions, selectedPermissionGroups, selectedRecipients }
}

export function buildBroadcastTargetPayload(
  state: BroadcastTargetSelectionState,
  optionCounts: { storeOptions: number; positionOptions: number; permissionOptions: number }
): BroadcastTargetPayload {
  const { selectedStores, selectedPositions, selectedPermissionGroups, selectedRecipients } = state
  const allStores = selectedStores.length === 0 || selectedStores.length === optionCounts.storeOptions
  const allPos =
    selectedPositions.length === 0 || selectedPositions.length === optionCounts.positionOptions
  const allPerm =
    selectedPermissionGroups.length === 0 ||
    selectedPermissionGroups.length === optionCounts.permissionOptions
  const targetStore = allStores ? '전체' : selectedStores.join(',')
  const targetRole = allPos ? '전체' : selectedPositions.join(',')
  const targetPermissionGroup = allPerm ? '' : selectedPermissionGroups.join(',')
  const targetRecipients =
    selectedRecipients.length > 0
      ? selectedRecipients.map((k) => {
          const [s, n] = k.split('|')
          return { store: s || '', name: n || '' }
        })
      : undefined
  return { targetStore, targetRole, targetPermissionGroup, targetRecipients }
}

export type BroadcastTargetSummaryLabels = {
  all: string
  office: string
  stores: string
  individuals: string
  countSuffix: string
  /** 예: 권한 / Permission */
  permissionPrefix?: string
}

/** 목록·미리보기용 한 줄 요약 */
export function formatBroadcastTargetSummary(
  row: BroadcastTargetRow,
  labels: BroadcastTargetSummaryLabels,
  knownStoreNames?: string[]
): string {
  let recCount = 0
  if (row.target_recipients) {
    try {
      const j = JSON.parse(String(row.target_recipients)) as unknown
      if (Array.isArray(j) && j.length > 0) {
        recCount = j.filter((x) => typeof x === 'string').length
      }
    } catch {
      recCount = 0
    }
  }
  if (recCount > 0) {
    const storePart = formatStorePart(row, labels, knownStoreNames)
    const extra = [storePart, formatRolePart(row), formatPermPart(row, labels)].filter(Boolean)
    const base = `${labels.individuals} ${recCount}${labels.countSuffix}`
    return extra.length > 0 ? `${base} (${extra.join(' · ')})` : base
  }

  const parts: string[] = []
  const storePart = formatStorePart(row, labels, knownStoreNames)
  if (storePart) parts.push(storePart)
  const rolePart = formatRolePart(row)
  if (rolePart) parts.push(rolePart)
  const permPart = formatPermPart(row, labels)
  if (permPart) parts.push(permPart)
  if (parts.length === 0) return labels.all
  return parts.join(' · ')
}

function formatStorePart(
  row: BroadcastTargetRow,
  labels: BroadcastTargetSummaryLabels,
  knownStoreNames?: string[]
): string {
  const ts = String(row.target_store || '전체').trim()
  if (!ts || ts === '전체' || ts === 'All') return labels.all
  const storeList = ts.split(',').map((s) => s.trim()).filter(Boolean)
  if (storeList.length === 0) return labels.all
  if (knownStoreNames && knownStoreNames.length > 0) {
    const allOfficeInSystem = knownStoreNames.filter((s) => isOfficeStore(s))
    const allFranchiseInSystem = knownStoreNames.filter((s) => !isOfficeStore(s))
    if (
      storeList.every((s) => isOfficeStore(s)) &&
      allOfficeInSystem.length > 0 &&
      storeList.length >= allOfficeInSystem.length
    ) {
      return labels.office
    }
    if (
      storeList.every((s) => !isOfficeStore(s)) &&
      allFranchiseInSystem.length > 0 &&
      storeList.length >= allFranchiseInSystem.length
    ) {
      return labels.stores
    }
  }
  if (storeList.length <= 3) return storeList.join(', ')
  return `${storeList[0]} 외 ${storeList.length - 1}`
}

function formatRolePart(row: BroadcastTargetRow): string {
  const tr = String(row.target_role || '전체').trim()
  if (!tr || tr === '전체' || tr === 'All') return ''
  const jobs = tr.split(',').map((s) => s.trim()).filter(Boolean)
  if (jobs.length <= 2) return jobs.join(', ')
  return `${jobs[0]} 외 ${jobs.length - 1}`
}

function formatPermPart(row: BroadcastTargetRow, labels: BroadcastTargetSummaryLabels): string {
  const tp = String(row.target_permission_group || '').trim()
  if (!tp) return ''
  const perms = tp.split(',').map((s) => s.trim()).filter(Boolean)
  const prefix = labels.permissionPrefix || '권한'
  if (perms.length <= 3) return `${prefix}: ${perms.join(', ')}`
  return `${prefix}: ${perms[0]} 외 ${perms.length - 1}`
}

export type BroadcastTargetAudienceFilter = 'all' | 'office' | 'store' | 'individual'

export function hrPolicyMatchesAudienceFilter(
  row: BroadcastTargetRow,
  filter: BroadcastTargetAudienceFilter,
  knownStoreNames: string[]
): boolean {
  if (filter === 'all') return true
  let recCount = 0
  if (row.target_recipients) {
    try {
      const j = JSON.parse(String(row.target_recipients)) as unknown
      if (Array.isArray(j) && j.length > 0) {
        recCount = j.filter((x) => typeof x === 'string').length
      }
    } catch {
      recCount = 0
    }
  }
  if (filter === 'individual') return recCount > 0

  const ts = String(row.target_store || '전체').trim()
  const storeList =
    ts && ts !== '전체' && ts !== 'All'
      ? ts.split(',').map((s) => s.trim()).filter(Boolean)
      : []

  if (filter === 'office') {
    if (recCount > 0) return false
    if (storeList.length === 0) return false
    const officeStores = knownStoreNames.filter((s) => isOfficeStore(s))
    return (
      storeList.length > 0 &&
      storeList.every((s) => isOfficeStore(s)) &&
      (officeStores.length === 0 || storeList.length >= officeStores.length)
    )
  }

  if (filter === 'store') {
    if (recCount > 0) return false
    if (storeList.length === 0) {
      const tr = String(row.target_role || '').trim()
      const tp = String(row.target_permission_group || '').trim()
      return Boolean(tr || tp)
    }
    return storeList.some((s) => !isOfficeStore(s))
  }

  return true
}
