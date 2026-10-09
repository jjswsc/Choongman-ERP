import 'server-only'

import {
  STORE_ACTION_CATEGORIES,
  STORE_ACTION_PRIORITIES,
  STORE_ACTION_SOURCE_TYPES,
  normalizeStoreActionPhotoUrls,
} from '@/lib/store-action-items'
import {
  appendStoreActionLog,
  computeStoreActionRecurrence,
  insertStoreActionItemRow,
  resolveStoreActionRecipient,
  storeActionStoreAllowed,
  type StoreActionRecipient,
  type StoreActionScope,
} from '@/lib/store-action-server'
import { syncDailyPlanOnStoreActionCreated } from '@/lib/daily-plan-hooks'

export type StoreActionCreateResult =
  | {
      ok: true
      id: number | null
      store: string
      title: string
      dueDate: string
      verifierName: string
      repeatCount: number
      parentId: number | null
      owner: StoreActionRecipient | null
    }
  | { ok: false; status: number; message: string }

/** 필수값·권한 검증. 통과하면 null */
export function validateStoreActionInput(
  data: Record<string, unknown>,
  scope: StoreActionScope
): { status: number; message: string } | null {
  const store = String(data.store || data.store_name || '').trim()
  const ownerName = String(data.ownerName || data.owner_name || '').trim()
  const dueDate = String(data.dueDate || data.due_date || '').trim().slice(0, 10)
  const verifierName = String(data.verifierName || data.verifier_name || '').trim()

  if (!store) return { status: 400, message: '매장을 선택하세요.' }
  if (!storeActionStoreAllowed(scope, store)) return { status: 403, message: '권한이 없는 매장입니다.' }
  if (!String(data.title || '').trim()) return { status: 400, message: '제목을 입력하세요.' }
  if (!ownerName) return { status: 400, message: '담당자(Owner)를 입력하세요.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { status: 400, message: '완료 기한(Due Date)을 선택하세요.' }
  if (!verifierName) return { status: 400, message: '재확인 담당자(Verifier)를 입력하세요.' }
  if (ownerName.toLowerCase() === verifierName.toLowerCase()) {
    return { status: 400, message: '담당자와 재확인 담당자는 달라야 합니다.' }
  }
  return null
}

/** 개선 과제 1건 검증·저장·이력·일정표 연동. 푸시는 호출하는 쪽에서 보냄 */
export async function createStoreActionItem(
  data: Record<string, unknown>,
  scope: StoreActionScope,
  fallbackActor: string
): Promise<StoreActionCreateResult> {
  const invalid = validateStoreActionInput(data, scope)
  if (invalid) return { ok: false, ...invalid }
  const store = String(data.store || data.store_name || '').trim()
  const title = String(data.title || '').trim()
  const ownerName = String(data.ownerName || data.owner_name || '').trim()
  const dueDate = String(data.dueDate || data.due_date || '').trim().slice(0, 10)
  const verifierName = String(data.verifierName || data.verifier_name || '').trim()

  let category = String(data.category || '기타').trim() || '기타'
  if (!(STORE_ACTION_CATEGORIES as readonly string[]).includes(category)) category = '기타'

  let priority = String(data.priority || '보통').trim() || '보통'
  if (!(STORE_ACTION_PRIORITIES as readonly string[]).includes(priority)) priority = '보통'

  let sourceType = String(data.sourceType || data.source_type || 'manual').trim() || 'manual'
  if (!(STORE_ACTION_SOURCE_TYPES as readonly string[]).includes(sourceType)) sourceType = 'manual'

  const sourceRef = String(data.sourceRef || data.source_ref || '').trim()
  const checkItemId = String(data.checkItemId || data.check_item_id || '').trim().slice(0, 200)
  const photoUrls = normalizeStoreActionPhotoUrls(data.photoUrls ?? data.photo_urls)
  const afterPhotoUrls = normalizeStoreActionPhotoUrls(data.afterPhotoUrls ?? data.after_photo_urls)
  const { repeatCount, parentId } = await computeStoreActionRecurrence({
    store,
    category,
    title,
    checkItemId,
    excludeSourceRef: sourceType === 'check_fail' ? sourceRef : '',
  })
  const nowIso = new Date().toISOString()
  const createdBy = String(data.createdBy || data.created_by || fallbackActor || '').trim()
  const ownerUserId = String(data.ownerUserId || data.owner_user_id || '').trim()
  const verifierUserId = String(data.verifierUserId || data.verifier_user_id || '').trim()
  const linkedRaw = data.linkedRepairTicketId ?? data.linked_repair_ticket_id

  const newId = await insertStoreActionItemRow({
    store_name: store,
    title,
    description: String(data.description || '').trim(),
    category,
    priority,
    status: 'open',
    owner_name: ownerName,
    owner_user_id: ownerUserId || null,
    due_date: dueDate,
    verifier_name: verifierName,
    verifier_user_id: verifierUserId || null,
    action_plan: String(data.actionPlan || data.action_plan || '').trim(),
    resolution_note: String(data.resolutionNote || data.resolution_note || '').trim(),
    photo_urls: photoUrls,
    after_photo_urls: afterPhotoUrls,
    source_type: sourceType,
    source_ref: sourceRef,
    linked_repair_ticket_id: linkedRaw != null && linkedRaw !== '' ? Number(linkedRaw) : null,
    repeat_count: repeatCount,
    check_item_id: checkItemId,
    parent_action_id: parentId,
    created_by: createdBy,
    created_at: nowIso,
    updated_at: nowIso,
  })

  if (newId) {
    await appendStoreActionLog({
      actionId: newId,
      actor: scope.actorName || createdBy,
      event: 'create',
      toStatus: 'open',
      note: title,
      detail: { ownerName, verifierName, dueDate, repeatCount, parentId, sourceType },
    })
  }

  const owner = await resolveStoreActionRecipient({ userId: ownerUserId, name: ownerName, fallbackStore: store })

  if (newId) {
    await syncDailyPlanOnStoreActionCreated({
      action: { id: newId, store, title, dueDate },
      ownerName,
      ownerUserId,
      actorName: scope.actorName || createdBy,
      actorEmployeeId: scope.actorEmployeeId,
    })
  }

  return { ok: true, id: newId, store, title, dueDate, verifierName, repeatCount, parentId, owner }
}
