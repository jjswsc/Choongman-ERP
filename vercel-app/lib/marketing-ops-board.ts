import type { MarketingCampaign } from "@/lib/api-client/marketing-campaigns-core"
import type { MarketingInfluencer } from "@/lib/api-client/marketing-influencers"
import type { MarketingMaterial } from "@/lib/api-client/marketing-materials"
import type { MarketingMaterialStoreCheck } from "@/lib/api-client/marketing-material-store-checks"
import { normalizeCampaignStatusForListFilter } from "@/lib/marketing-campaign-list-query"
import {
  materialTargetStores,
  resolveStoreMaterialTaskPhase,
  findStoreCheckForBranch,
  type StoreMaterialTaskPhase,
} from "@/lib/marketing-material-checklist-utils"
import { storeDispatchQuantity } from "@/lib/marketing-store-qty"

export type MarketingTaskColumn = "todo" | "doing" | "done"

export function campaignTouchesToday(
  c: Pick<MarketingCampaign, "status" | "startDate" | "endDate" | "designStartDate" | "designEndDate">,
  today: string
): boolean {
  const s = (c.startDate ?? c.designStartDate ?? "").trim()
  const e = (c.endDate ?? c.designEndDate ?? "").trim()
  if (!s && !e) return normalizeCampaignStatusForListFilter(c.status) === "ongoing"
  const from = s || "1970-01-01"
  const to = e || s || "2999-12-31"
  return today >= from && today <= to
}

export function isCampaignInProgress(
  c: Pick<MarketingCampaign, "status" | "startDate" | "endDate" | "designStartDate" | "designEndDate">,
  today: string
): boolean {
  if (normalizeCampaignStatusForListFilter(c.status) === "ongoing") return true
  return campaignTouchesToday(c, today)
}

export type PendingStorePhase = {
  store: string
  phase: StoreMaterialTaskPhase
}

export type PendingDeliveryRow = {
  materialId: string
  campaignId: string
  campaignTopic: string
  campaignNo?: string
  materialName: string
  materialType: string
  materialStatus: string
  displayStartDate: string | null
  pendingStores: PendingStorePhase[]
  quantity?: number
}

export type DispatchLine = {
  materialId: string
  campaignId: string
  campaignTopic: string
  campaignNo?: string
  materialName: string
  materialType: string
  store: string
  phase: StoreMaterialTaskPhase
  quantity?: number
  quantityEstimated?: boolean
  pendingStoreCount: number
}

export function listPendingDeliveries(params: {
  campaigns: MarketingCampaign[]
  materials: MarketingMaterial[]
  checks: MarketingMaterialStoreCheck[]
  hqLabel: string
  today: string
  /** true면 진행 중 캠페인만 */
  inProgressOnly?: boolean
  campaignId?: string
}): PendingDeliveryRow[] {
  const campById = new Map(params.campaigns.map((c) => [String(c.id), c]))
  const cidFilter = (params.campaignId || "").trim()
  const rows: PendingDeliveryRow[] = []

  for (const material of params.materials) {
    const cid = String(material.campaignId || "").trim()
    if (!cid) continue
    if (cidFilter && cid !== cidFilter) continue
    const campaign = campById.get(cid)
    if (!campaign) continue
    if (params.inProgressOnly && !isCampaignInProgress(campaign, params.today)) continue

    const stores = materialTargetStores(material, params.hqLabel)
    const pendingStores: PendingStorePhase[] = []
    for (const store of stores) {
      const check = findStoreCheckForBranch(params.checks, material.id, store)
      const phase = resolveStoreMaterialTaskPhase(material, check)
      if (phase !== "done") pendingStores.push({ store, phase })
    }
    if (pendingStores.length === 0) continue

    rows.push({
      materialId: material.id,
      campaignId: cid,
      campaignTopic: campaign.topic,
      campaignNo: campaign.campaignNo,
      materialName: material.name || material.type,
      materialType: material.type,
      materialStatus: material.status,
      displayStartDate: material.displayStartDate,
      pendingStores,
      quantity: material.quantity,
    })
  }

  rows.sort((a, b) => {
    const da = a.displayStartDate || "9999"
    const db = b.displayStartDate || "9999"
    if (da !== db) return da.localeCompare(db)
    return a.materialName.localeCompare(b.materialName)
  })
  return rows
}

/** 센터 출고용: 품목×매장 한 행. 수량은 매장 기록값, 없으면 총수량 균등 배분. */
export function listDispatchLines(params: Parameters<typeof listPendingDeliveries>[0]): DispatchLine[] {
  const rows = listPendingDeliveries(params)
  const matById = new Map(params.materials.map((m) => [String(m.id), m]))
  const lines: DispatchLine[] = []
  for (const row of rows) {
    const material = matById.get(row.materialId)
    const allStores = material ? materialTargetStores(material, params.hqLabel) : row.pendingStores.map((s) => s.store)
    for (const s of row.pendingStores) {
      const check = findStoreCheckForBranch(params.checks, row.materialId, s.store)
      const storeIndex = Math.max(0, allStores.findIndex((name) => name === s.store))
      const qty = storeDispatchQuantity({
        checkQuantity: check?.quantity,
        materialQuantity: material?.quantity ?? row.quantity,
        storeCount: allStores.length || row.pendingStores.length,
        storeIndex,
      })
      lines.push({
        materialId: row.materialId,
        campaignId: row.campaignId,
        campaignTopic: row.campaignTopic,
        campaignNo: row.campaignNo,
        materialName: row.materialName,
        materialType: row.materialType,
        store: s.store,
        phase: s.phase,
        quantity: qty.qty,
        quantityEstimated: qty.estimated,
        pendingStoreCount: row.pendingStores.length,
      })
    }
  }
  return lines
}

export function countPendingInstallStores(rows: PendingDeliveryRow[]): number {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const s of row.pendingStores) {
      if (s.phase === "install" || s.phase === "receive") {
        keys.add(`${row.materialId}::${s.store}`)
      }
    }
  }
  return keys.size
}

export function materialTaskColumn(
  material: MarketingMaterial,
  checks: MarketingMaterialStoreCheck[],
  hqLabel: string
): MarketingTaskColumn {
  const stores = materialTargetStores(material, hqLabel)
  if (stores.length === 0) {
    const st = String(material.status || "").trim()
    if (st === "distributed") return "done"
    if (st === "completed" || st === "producing") return "doing"
    return "todo"
  }
  let done = 0
  let producedWait = 0
  for (const store of stores) {
    const check = findStoreCheckForBranch(checks, material.id, store)
    const phase = resolveStoreMaterialTaskPhase(material, check)
    if (phase === "done") done++
    else if (phase === "waiting_production") producedWait++
  }
  if (done === stores.length) return "done"
  if (producedWait === stores.length) return "todo"
  return "doing"
}

export function influencerTaskColumn(inf: Pick<MarketingInfluencer, "status">): MarketingTaskColumn {
  const st = normalizeCampaignStatusForListFilter(inf.status)
  if (st === "finish") return "done"
  if (st === "ongoing") return "doing"
  return "todo"
}

export function isInfluencerOpen(inf: Pick<MarketingInfluencer, "status">): boolean {
  return influencerTaskColumn(inf) !== "done"
}

export type PendingInfluencerRow = {
  influencer: MarketingInfluencer
  campaignTopic: string
  campaignNo?: string
}

export function listPendingInfluencers(params: {
  influencers: MarketingInfluencer[]
  campaigns: MarketingCampaign[]
  today: string
  inProgressOnly?: boolean
  campaignId?: string
}): PendingInfluencerRow[] {
  const campById = new Map(params.campaigns.map((c) => [String(c.id), c]))
  const cidFilter = (params.campaignId || "").trim()
  const out: PendingInfluencerRow[] = []
  for (const inf of params.influencers) {
    if (!isInfluencerOpen(inf)) continue
    const cid = String(inf.campaignId || "").trim()
    if (cidFilter && cid !== cidFilter) continue
    const campaign = cid ? campById.get(cid) : undefined
    if (params.inProgressOnly && campaign && !isCampaignInProgress(campaign, params.today)) continue
    out.push({
      influencer: inf,
      campaignTopic: campaign?.topic || "",
      campaignNo: campaign?.campaignNo,
    })
  }
  out.sort((a, b) => {
    const da = a.influencer.publishDate || a.influencer.shootingDate || "9999"
    const db = b.influencer.publishDate || b.influencer.shootingDate || "9999"
    return da.localeCompare(db)
  })
  return out
}
