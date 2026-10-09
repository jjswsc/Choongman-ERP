import 'server-only'

import type { JwtPayload } from '@/lib/jwt-auth'
import { sendFcmToRecipients } from '@/lib/firebase-admin'
import { getNotificationSettings } from '@/lib/notification-settings-server'
import { hasOfficeStaffScope, isSupervisorRole } from '@/lib/permissions'
import { storeOpsStoreInScope, storeOpsStoreNameScopePostgrestFilter } from '@/lib/store-ops-alert-utils'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeTitleKey } from '@/lib/store-action-items'

export type StoreActionRecipient = { store: string; name: string; nick?: string }

export type StoreActionScope = {
  /** 본사·회계·오피스·슈퍼바이저 — 전 매장 */
  all: boolean
  stores: string[]
  canVerify: boolean
  actorName: string
  actorEmployeeId: number | null
}

export function resolveStoreActionScope(auth: JwtPayload): StoreActionScope {
  const role = String(auth.role || '').toLowerCase()
  const store = String(auth.store || '').trim()
  const office = hasOfficeStaffScope(role, store)
  const supervisor = isSupervisorRole(role)
  const stores = [
    ...new Set(
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(store ? [store] : [])
    ),
  ]
  const eid = auth.employeeId != null ? Math.floor(Number(auth.employeeId)) : 0
  return {
    all: office || supervisor,
    stores,
    canVerify: office || supervisor,
    actorName: String(auth.name || '').trim(),
    actorEmployeeId: Number.isFinite(eid) && eid > 0 ? eid : null,
  }
}

/** PostgREST store_name 범위 필터. 전 매장이면 '' */
export function storeActionScopeFilter(scope: StoreActionScope): string {
  if (scope.all) return ''
  const f = storeOpsStoreNameScopePostgrestFilter(scope.stores)
  return f || 'store_name=eq.__none__'
}

export function storeActionStoreAllowed(scope: StoreActionScope, store: string): boolean {
  return storeOpsStoreInScope(store, scope.stores, scope.all)
}

export type StoreActionLogEvent =
  | 'create'
  | 'update'
  | 'status'
  | 'request_verify'
  | 'verify_pass'
  | 'verify_reject'
  | 'reassign'

/** 변경 이력 — 테이블 미생성(store_action_logs) 시 조용히 무시 */
export async function appendStoreActionLog(params: {
  actionId: number
  actor: string
  event: StoreActionLogEvent
  fromStatus?: string
  toStatus?: string
  note?: string
  detail?: Record<string, unknown>
}): Promise<void> {
  if (!params.actionId) return
  try {
    await supabaseInsert('store_action_logs', {
      action_id: params.actionId,
      actor: params.actor || '',
      event: params.event,
      from_status: params.fromStatus || '',
      to_status: params.toStatus || '',
      note: String(params.note || '').slice(0, 2000),
      detail: params.detail || {},
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('store_action_logs insert skipped:', e instanceof Error ? e.message : e)
  }
}

/**
 * 재발 판정 — 같은 매장에서 점검 항목 키(check_item_id)가 같거나,
 * 키가 없으면 같은 카테고리·같은 제목. 직전 건을 parent로 연결.
 * excludeSourceRef: 같은 점검(같은 출처)에서 함께 등록한 문제는 재발로 세지 않음.
 */
export async function computeStoreActionRecurrence(params: {
  store: string
  category: string
  title: string
  checkItemId?: string
  excludeSourceRef?: string
}): Promise<{ repeatCount: number; parentId: number | null }> {
  const store = String(params.store || '').trim()
  if (!store) return { repeatCount: 0, parentId: null }
  const checkItemId = String(params.checkItemId || '').trim()
  const exclude = String(params.excludeSourceRef || '').trim()
  const keep = <T extends { source_ref?: string | null }>(rows: T[] | null | undefined): T[] =>
    (rows || []).filter((r) => !exclude || String(r.source_ref || '') !== exclude)

  if (checkItemId) {
    try {
      const rows = keep(
        (await supabaseSelectFilter(
          'store_action_items',
          [
            `store_name=eq.${encodeURIComponent(store)}`,
            `check_item_id=eq.${encodeURIComponent(checkItemId)}`,
          ].join('&'),
          { select: 'id,repeat_count,source_ref', limit: 200, order: 'id.desc' }
        )) as { id?: number; repeat_count?: number; source_ref?: string | null }[]
      )
      if (rows.length > 0) {
        const maxRepeat = Math.max(...rows.map((r) => Number(r.repeat_count || 0) || 0))
        return {
          repeatCount: Math.max(maxRepeat + 1, rows.length),
          parentId: Number(rows[0].id || 0) || null,
        }
      }
    } catch {
      /* check_item_id 컬럼 미배포 — 제목 기준으로 폴백 */
    }
  }

  const titleKey = normalizeTitleKey(params.title)
  if (!titleKey) return { repeatCount: 0, parentId: null }
  try {
    const rows = keep(
      (await supabaseSelectFilter(
        'store_action_items',
        [
          `store_name=eq.${encodeURIComponent(store)}`,
          `category=eq.${encodeURIComponent(params.category || '기타')}`,
        ].join('&'),
        { select: 'id,title,repeat_count,source_ref', limit: 200, order: 'id.desc' }
      )) as { id?: number; title?: string; repeat_count?: number; source_ref?: string | null }[]
    )
    let maxRepeat = 0
    let similar = 0
    let parentId: number | null = null
    for (const r of rows) {
      if (normalizeTitleKey(String(r.title || '')) !== titleKey) continue
      similar += 1
      if (parentId == null) parentId = Number(r.id || 0) || null
      const rc = Number(r.repeat_count || 0) || 0
      if (rc > maxRepeat) maxRepeat = rc
    }
    if (similar === 0) return { repeatCount: 0, parentId: null }
    return { repeatCount: Math.max(maxRepeat + 1, similar), parentId }
  } catch {
    return { repeatCount: 0, parentId: null }
  }
}

const V2_COLUMNS = ['check_item_id', 'parent_action_id'] as const

/** INSERT — v2 컬럼 미배포 시 해당 컬럼 제외 후 재시도. 생성된 id 반환 */
export async function insertStoreActionItemRow(row: Record<string, unknown>): Promise<number | null> {
  const pickId = (res: unknown): number | null => {
    const first = Array.isArray(res) ? res[0] : res
    const id = first && typeof first === 'object' ? Number((first as { id?: unknown }).id) : NaN
    return Number.isFinite(id) && id > 0 ? id : null
  }
  try {
    return pickId(await supabaseInsert('store_action_items', row))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!V2_COLUMNS.some((c) => msg.includes(c))) throw e
    const stripped = { ...row }
    for (const c of V2_COLUMNS) delete stripped[c]
    return pickId(await supabaseInsert('store_action_items', stripped))
  }
}

type EmployeeLite = { id?: number; name?: string; nick?: string; store?: string }

/** 담당자/재확인자 → 푸시 수신자(store|name). 직원 id 우선, 없으면 이름 매칭 */
export async function resolveStoreActionRecipient(params: {
  userId?: string | number | null
  name?: string | null
  fallbackStore?: string | null
}): Promise<StoreActionRecipient | null> {
  const id = Number(params.userId || 0)
  const name = String(params.name || '').trim()
  try {
    if (Number.isFinite(id) && id > 0) {
      const rows = (await supabaseSelectFilter('employees', `id=eq.${id}`, {
        select: 'id,name,nick,store',
        limit: 1,
      })) as EmployeeLite[]
      const e = rows?.[0]
      if (e?.name && e.store) {
        return { store: String(e.store).trim(), name: String(e.name).trim(), nick: String(e.nick || '').trim() }
      }
    }
    if (name) {
      const rows = (await supabaseSelectFilter('employees', `name=eq.${encodeURIComponent(name)}`, {
        select: 'id,name,nick,store',
        limit: 5,
      })) as EmployeeLite[]
      const fb = String(params.fallbackStore || '').trim()
      const e = rows?.find((r) => String(r.store || '').trim() === fb) || rows?.[0]
      if (e?.name && e.store) {
        return { store: String(e.store).trim(), name: String(e.name).trim(), nick: String(e.nick || '').trim() }
      }
      if (fb) return { store: fb, name }
    }
  } catch (e) {
    console.warn('resolveStoreActionRecipient:', e instanceof Error ? e.message : e)
  }
  return null
}

/** 개선 과제 푸시 — 공지 푸시 설정이 꺼져 있으면 발송하지 않음 */
export async function pushStoreActionNotice(params: {
  title: string
  body: string
  recipients: (StoreActionRecipient | null)[]
}): Promise<number> {
  const list = params.recipients.filter((r): r is StoreActionRecipient => !!r && !!r.store && !!r.name)
  const unique = list.filter(
    (r, i, arr) => arr.findIndex((x) => x.store === r.store && x.name === r.name) === i
  )
  if (unique.length === 0) return 0
  try {
    const settings = await getNotificationSettings()
    if (!settings.pushNoticeEnabled) return 0
    await sendFcmToRecipients({ title: params.title, body: params.body, recipients: unique })
    return unique.length
  } catch (e) {
    console.error('pushStoreActionNotice:', e)
    return 0
  }
}
