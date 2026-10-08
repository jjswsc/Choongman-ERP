import {
  isStoreActionOverdue,
  normalizeStoreActionPhotoUrls,
  type StoreActionSourceType,
  type StoreActionStatus,
} from "@/lib/store-action-items"

export type StoreActionItemRow = {
  id?: number
  store_name?: string
  title?: string
  description?: string
  category?: string
  priority?: string
  status?: string
  owner_name?: string
  owner_user_id?: string | null
  due_date?: string | null
  verifier_name?: string
  verifier_user_id?: string | null
  verified_at?: string | null
  verification_note?: string
  action_plan?: string
  resolution_note?: string
  photo_urls?: unknown
  after_photo_urls?: unknown
  source_type?: string
  source_ref?: string
  linked_repair_ticket_id?: number | null
  repeat_count?: number | null
  check_item_id?: string | null
  parent_action_id?: number | null
  created_by?: string
  created_at?: string
  updated_at?: string
  completed_at?: string | null
}

export type StoreActionItemDto = {
  id: number
  store: string
  title: string
  description: string
  category: string
  priority: string
  status: StoreActionStatus | string
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
  sourceType: StoreActionSourceType | string
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

export function mapStoreActionItemRow(d: StoreActionItemRow, todayYmd: string): StoreActionItemDto {
  const status = String(d.status || "open")
  const dueDate = d.due_date ? String(d.due_date).slice(0, 10) : ""
  return {
    id: Number(d.id || 0),
    store: String(d.store_name || ""),
    title: String(d.title || ""),
    description: String(d.description || ""),
    category: String(d.category || ""),
    priority: String(d.priority || ""),
    status,
    ownerName: String(d.owner_name || ""),
    ownerUserId: String(d.owner_user_id || ""),
    dueDate,
    verifierName: String(d.verifier_name || ""),
    verifierUserId: String(d.verifier_user_id || ""),
    verifiedAt: d.verified_at ? String(d.verified_at) : "",
    verificationNote: String(d.verification_note || ""),
    actionPlan: String(d.action_plan || ""),
    resolutionNote: String(d.resolution_note || ""),
    photoUrls: normalizeStoreActionPhotoUrls(d.photo_urls),
    afterPhotoUrls: normalizeStoreActionPhotoUrls(d.after_photo_urls),
    sourceType: String(d.source_type || "manual"),
    sourceRef: String(d.source_ref || ""),
    linkedRepairTicketId:
      d.linked_repair_ticket_id != null && Number.isFinite(Number(d.linked_repair_ticket_id))
        ? Number(d.linked_repair_ticket_id)
        : null,
    repeatCount: Number(d.repeat_count || 0) || 0,
    checkItemId: String(d.check_item_id || ""),
    parentActionId:
      d.parent_action_id != null && Number.isFinite(Number(d.parent_action_id))
        ? Number(d.parent_action_id)
        : null,
    createdBy: String(d.created_by || ""),
    createdAt: d.created_at ? String(d.created_at) : "",
    updatedAt: d.updated_at ? String(d.updated_at) : "",
    completedAt: d.completed_at ? String(d.completed_at) : "",
    overdue: isStoreActionOverdue({ status, dueDate, todayYmd }),
  }
}
