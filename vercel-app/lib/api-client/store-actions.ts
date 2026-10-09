/**
 * 매장 개선 과제(CAPA) API
 */
import { apiFetch } from "../api/fetch"
import { apiFetchWithOffline } from "../api/fetch-offline"
import { jsonAsArray } from "../safe-api-json"

export type StoreActionItem = {
  id: number
  store: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  ownerName: string
  ownerUserId: string
  dueDate: string
  verifierName: string
  verifierUserId: string
  verifiedAt: string
  verificationNote: string
  actionPlan: string
  resolutionNote: string
  photoUrls: string[]
  afterPhotoUrls: string[]
  sourceType: string
  sourceRef: string
  linkedRepairTicketId: number | null
  repeatCount: number
  checkItemId: string
  parentActionId: number | null
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt: string
  overdue: boolean
}

export async function getStoreActionItems(params: {
  startStr?: string
  endStr?: string
  store?: string
  status?: string
  category?: string
  priority?: string
  owner?: string
  verifier?: string
  sourceType?: string
  mine?: boolean
  openOnly?: boolean
  overdueOnly?: boolean
  /** 이 날짜(방콕) 이후 완료된 건 — 등록일 기간 무시 */
  completedSince?: string
  q?: string
  id?: string | number
}) {
  const q = new URLSearchParams()
  if (params.startStr) q.set("startStr", params.startStr)
  if (params.endStr) q.set("endStr", params.endStr)
  if (params.store) q.set("store", params.store)
  if (params.status) q.set("status", params.status)
  if (params.category) q.set("category", params.category)
  if (params.priority) q.set("priority", params.priority)
  if (params.owner) q.set("owner", params.owner)
  if (params.verifier) q.set("verifier", params.verifier)
  if (params.sourceType) q.set("sourceType", params.sourceType)
  if (params.mine) q.set("mine", "1")
  if (params.completedSince) q.set("completedSince", params.completedSince)
  if (params.openOnly) q.set("openOnly", "1")
  if (params.overdueOnly) q.set("overdueOnly", "1")
  if (params.q) q.set("q", params.q)
  if (params.id != null && params.id !== "") q.set("id", String(params.id))
  const res = await apiFetchWithOffline(`/api/getStoreActionItems?${q}`)
  return jsonAsArray<StoreActionItem>(await res.json())
}

export async function getOpenStoreActionsByStore(store: string) {
  const q = new URLSearchParams({ store })
  const res = await apiFetchWithOffline(`/api/getOpenStoreActionsByStore?${q}`)
  return (await res.json()) as {
    success: boolean
    message?: string
    store?: string
    today?: string
    overdueCount?: number
    pendingVerifyCount?: number
    canVerify?: boolean
    items: StoreActionItem[]
  }
}

export type StoreActionAssignee = {
  id: number
  name: string
  nick: string
  store: string
  job: string
  role: string
  group: "store" | "hq"
}

export async function getStoreActionAssignees(store: string) {
  const q = new URLSearchParams()
  if (store) q.set("store", store)
  const res = await apiFetchWithOffline(`/api/getStoreActionAssignees?${q}`)
  const j = (await res.json()) as { success?: boolean; list?: StoreActionAssignee[] }
  return Array.isArray(j.list) ? j.list : []
}

export type StoreActionLog = {
  id: number
  actor: string
  event: string
  fromStatus: string
  toStatus: string
  note: string
  createdAt: string
}

export async function getStoreActionLogs(id: number | string) {
  const res = await apiFetchWithOffline(`/api/getStoreActionLogs?id=${encodeURIComponent(String(id))}`)
  const j = (await res.json()) as { success?: boolean; list?: StoreActionLog[] }
  return Array.isArray(j.list) ? j.list : []
}

export type StoreActionScoreRow = {
  key: string
  total: number
  completed: number
  onTime: number
  overdueOpen: number
  open: number
  repeat: number
  onTimeRate: number
  avgCloseDays: number | null
}

export type StoreActionScorecardResponse = {
  success: boolean
  message?: string
  month?: string
  startStr?: string
  endStr?: string
  byStore?: StoreActionScoreRow[]
  byOwner?: StoreActionScoreRow[]
  byVerifier?: StoreActionScoreRow[]
  total?: StoreActionScoreRow
}

export async function getStoreActionScorecard(month: string) {
  const res = await apiFetchWithOffline(`/api/getStoreActionScorecard?month=${encodeURIComponent(month)}`)
  return (await res.json()) as StoreActionScorecardResponse
}

export async function saveStoreActionItem(data: Record<string, unknown>) {
  const res = await apiFetchWithOffline("/api/saveStoreActionItem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    id?: number | null
    repeatCount?: number
    parentId?: number | null
  }>
}

/** 여러 건 한 번에 등록 — 모두 검증 후 저장 */
export async function saveStoreActionItems(items: Record<string, unknown>[]) {
  const res = await apiFetchWithOffline("/api/saveStoreActionItems", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    created?: { id: number | null; title: string; repeatCount: number }[]
  }>
}

export async function updateStoreActionItem(
  rowOrId: string | number,
  data: Record<string, unknown>,
  action?: string
) {
  const res = await apiFetchWithOffline("/api/updateStoreActionItem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowOrId, data, action }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function uploadStoreActionPhoto(store: string, file: File) {
  const pres = await apiFetch("/api/uploadStoreActionPhoto/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      store,
      fileName: file.name,
      contentType: file.type || "image/jpeg",
      fileSize: file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, url: undefined as string | undefined, message: pjson.message || "업로드 준비 실패" }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import("@/lib/storage-client-upload")
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => "")
    return { success: false, url: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, url: pjson.publicUrl, message: undefined as string | undefined }
}
