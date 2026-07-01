import type { MarketingMaterial } from '@/lib/api-client/marketing-materials'
import type { MarketingMaterialStoreCheck } from '@/lib/api-client/marketing-material-store-checks'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export const CHECKLIST_DEFAULT_MATERIAL_TYPES = new Set(['standee', 'poster'])

export function materialTargetStores(
  material: Pick<MarketingMaterial, 'branches' | 'isHqWide'>,
  hqLabel: string
): string[] {
  if (material.isHqWide) return [hqLabel]
  const branches = (material.branches || []).map((b) => String(b).trim()).filter(Boolean)
  return branches.length > 0 ? branches : []
}

export function storeCheckKey(materialId: string, storeName: string): string {
  return `${materialId}::${storeName}`
}

export function buildStoreCheckMap(
  checks: MarketingMaterialStoreCheck[]
): Map<string, MarketingMaterialStoreCheck> {
  const map = new Map<string, MarketingMaterialStoreCheck>()
  for (const c of checks) {
    map.set(storeCheckKey(c.materialId, c.storeName), c)
  }
  return map
}

/** branches 매장명과 DB store_name(CM 접두·대소문자 차이)을 동일 매장으로 매칭 */
export function findStoreCheckForBranch(
  checks: MarketingMaterialStoreCheck[],
  materialId: string,
  branchStore: string
): MarketingMaterialStoreCheck | undefined {
  const mid = String(materialId || '').trim()
  const branch = String(branchStore || '').trim()
  if (!mid || !branch) return undefined
  return checks.find(
    (c) => c.materialId === mid && storesMatchForGradeLookup(c.storeName, branch)
  )
}

export type MaterialChecklistProgress = {
  storeCount: number
  receivedCount: number
  installedCount: number
  produced: boolean
}

export function materialChecklistProgress(
  material: MarketingMaterial,
  checks: MarketingMaterialStoreCheck[],
  hqLabel: string
): MaterialChecklistProgress {
  const stores = materialTargetStores(material, hqLabel)
  let receivedCount = 0
  let installedCount = 0
  for (const store of stores) {
    const row = findStoreCheckForBranch(checks, material.id, store)
    if (row?.receivedOn) receivedCount++
    if (row?.installedOn) installedCount++
  }
  return {
    storeCount: stores.length,
    receivedCount,
    installedCount,
    produced: Boolean((material.producedOn || '').trim()),
  }
}

export function filterChecklistMaterials(
  materials: MarketingMaterial[],
  options?: { types?: Set<string>; campaignId?: string }
): MarketingMaterial[] {
  const types = options?.types ?? CHECKLIST_DEFAULT_MATERIAL_TYPES
  const cid = (options?.campaignId || '').trim()
  return materials.filter((m) => {
    if (cid && String(m.campaignId || '').trim() !== cid) return false
    return types.has(String(m.type || '').trim().toLowerCase())
  })
}

export type StoreMaterialTaskPhase = 'waiting_production' | 'receive' | 'install' | 'done'

export function resolveStoreMaterialTaskPhase(
  material: Pick<MarketingMaterial, 'producedOn'>,
  check: MarketingMaterialStoreCheck | undefined
): StoreMaterialTaskPhase {
  const produced = Boolean((material.producedOn || '').trim())
  if (!produced) return 'waiting_production'
  if (!check?.receivedOn) return 'receive'
  if (!check?.installedOn) return 'install'
  return 'done'
}

export function listStoreMaterialTasks(
  materials: MarketingMaterial[],
  checks: MarketingMaterialStoreCheck[],
  storeName: string,
  hqLabel: string,
  options?: { types?: Set<string>; campaignId?: string; includeDone?: boolean }
): Array<{
  material: MarketingMaterial
  phase: StoreMaterialTaskPhase
  check?: MarketingMaterialStoreCheck
}> {
  const targetStore = String(storeName || '').trim()
  if (!targetStore) return []
  const filtered = filterChecklistMaterials(materials, {
    types: options?.types,
    campaignId: options?.campaignId,
  })
  const rows: Array<{
    material: MarketingMaterial
    phase: StoreMaterialTaskPhase
    check?: MarketingMaterialStoreCheck
  }> = []
  for (const material of filtered) {
    const targets = materialTargetStores(material, hqLabel)
    if (!targets.some((s) => storesMatchForGradeLookup(s, targetStore))) continue
    const check = findStoreCheckForBranch(checks, material.id, targetStore)
    const phase = resolveStoreMaterialTaskPhase(material, check)
    if (phase === 'done' && !options?.includeDone) continue
    rows.push({ material, phase, check })
  }
  return rows
}

/** 수령·설치 대기 건수 (제작 대기 제외) */
export function countPendingStoreMaterialTasks(
  materials: MarketingMaterial[],
  checks: MarketingMaterialStoreCheck[],
  storeName: string,
  hqLabel: string,
  options?: { types?: Set<string>; campaignId?: string }
): number {
  return listStoreMaterialTasks(materials, checks, storeName, hqLabel, options).filter(
    (row) => row.phase === 'receive' || row.phase === 'install'
  ).length
}

type CampaignPickRow = { id: string; startDate?: string | null }

/** 홍보물(체크리스트 대상)이 등록된 campaign_id 집합 */
export function campaignIdsWithRegisteredMaterials(
  materials: MarketingMaterial[],
  options?: { types?: Set<string> }
): Set<string> {
  const types = options?.types ?? CHECKLIST_DEFAULT_MATERIAL_TYPES
  const ids = new Set<string>()
  for (const m of materials) {
    const cid = String(m.campaignId || '').trim()
    if (!cid) continue
    if (!types.has(String(m.type || '').trim().toLowerCase())) continue
    ids.add(cid)
  }
  return ids
}

/** 홍보물이 등록된 캠페인만 (목록 축소용) */
export function filterCampaignsWithRegisteredMaterials<T extends CampaignPickRow>(
  campaigns: T[],
  materials: MarketingMaterial[],
  options?: { types?: Set<string> }
): T[] {
  const ids = campaignIdsWithRegisteredMaterials(materials, options)
  if (ids.size === 0) return []
  return campaigns.filter((c) => ids.has(String(c.id || '').trim()))
}

/** 이 매장에 체크리스트 대상 홍보물이 등록된 캠페인만 (모바일 매장용) */
export function filterCampaignsWithStoreChecklistMaterials<T extends CampaignPickRow>(
  campaigns: T[],
  materials: MarketingMaterial[],
  storeName: string,
  hqLabel: string,
  options?: { types?: Set<string> }
): T[] {
  const store = String(storeName || '').trim()
  if (!store) return []
  const ids = new Set<string>()
  const types = options?.types ?? CHECKLIST_DEFAULT_MATERIAL_TYPES
  for (const m of materials) {
    const cid = String(m.campaignId || '').trim()
    if (!cid) continue
    if (!types.has(String(m.type || '').trim().toLowerCase())) continue
    const targets = materialTargetStores(m, hqLabel)
    if (!targets.some((s) => storesMatchForGradeLookup(s, store))) continue
    ids.add(cid)
  }
  if (ids.size === 0) return []
  return campaigns.filter((c) => ids.has(String(c.id || '').trim()))
}

/** 진행 중·미완료 항목이 있는 캠페인을 우선 선택 (startDate 최신) */
export function pickCampaignIdWithPendingStoreTasks(
  campaigns: CampaignPickRow[],
  materials: MarketingMaterial[],
  checks: MarketingMaterialStoreCheck[],
  storeName: string,
  hqLabel: string
): string {
  const targetStore = String(storeName || '').trim()
  if (!targetStore || campaigns.length === 0) return ''

  const scored = campaigns
    .map((c) => {
      const cid = String(c.id || '').trim()
      if (!cid) return null
      const pending = countPendingStoreMaterialTasks(materials, checks, targetStore, hqLabel, {
        campaignId: cid,
      })
      return { id: cid, pending, startDate: String(c.startDate || '').trim() }
    })
    .filter((row): row is { id: string; pending: number; startDate: string } => Boolean(row))

  const withPending = scored.filter((row) => row.pending > 0)
  const pool = withPending.length > 0 ? withPending : scored.filter((row) => row.pending >= 0)
  if (pool.length === 0) return ''

  pool.sort((a, b) => {
    if (b.pending !== a.pending) return b.pending - a.pending
    return b.startDate.localeCompare(a.startDate)
  })
  return pool[0]?.id || ''
}

export function aggregateChecklistProgress(
  materials: MarketingMaterial[],
  checks: MarketingMaterialStoreCheck[],
  hqLabel: string,
  options?: { types?: Set<string>; campaignId?: string }
): { received: number; receivedTotal: number; installed: number; installedTotal: number } {
  const filtered = filterChecklistMaterials(materials, options)
  let received = 0
  let receivedTotal = 0
  let installed = 0
  let installedTotal = 0
  for (const m of filtered) {
    const p = materialChecklistProgress(m, checks, hqLabel)
    received += p.receivedCount
    receivedTotal += p.storeCount
    installed += p.installedCount
    installedTotal += p.storeCount
  }
  return { received, receivedTotal, installed, installedTotal }
}
