/**
 * 품목/거래처 관리 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getAdminItemsWithCache, getWarehouseLocationsWithCache, invalidateAdminItemsCache } from '../offline/erp-offline'
import { jsonAsArray } from '../safe-api-json'

export interface AdminItem {
  code: string
  name: string
  category: string
  vendor: string
  outboundLocation?: string
  spec: string
  unit?: string
  price: number
  cost: number
  /** 총 수량 (표준 단위). 있으면 단위당 원가 = price/totalQuantity */
  totalQuantity?: number | null
  taxType: 'taxable' | 'exempt' | 'zero'
  imageUrl: string
  hasImage: boolean
  description?: string
  purchaseSource?: 'hq' | 'store'
  /** true이면 매장 발주 품목 검색에 노출되지 않음 */
  orderDisabled?: boolean
  /** 표시 순서. 엑셀 가져오기 시 행 순서로 설정. 있으면 이 값 기준 정렬 */
  sortOrder?: number
  /** 재고 기본 단위 (저장 단위). 비어 있으면 unit 사용 (하위 호환) */
  stockBaseUnit?: string
  /** 조정/조사 시 선택 단위 (하위 호환) */
  stockUnitOptions?: { unit: string; factor: number }[]
  /** 표준 단위 목록. (totalQuantity) [unit] = 1 규격 */
  standardUnits?: { unit: string; totalQuantity: number }[]
  /** 품목별 기본 계정과목 (선택). 미지정이면 기존 재고/매입 흐름 유지 */
  accountSubjectId?: number | null
}

export interface AdminVendor {
  code: string
  name: string
  gps_name?: string
  sales_outlet?: string
  contact: string
  phone: string
  email: string
  address: string
  tax_no?: string
  type: 'purchase' | 'sales' | 'both'
  memo: string
}

export async function getAdminItems(options?: { scope?: 'outbound' | 'order' }) {
  return getAdminItemsWithCache(options) as Promise<AdminItem[]>
}

export interface WarehouseLocation {
  id?: number
  name: string
  address: string
  location_code: string
  sort_order: number
}

export async function getWarehouseLocations() {
  return getWarehouseLocationsWithCache() as Promise<WarehouseLocation[]>
}

export async function saveWarehouseLocation(params: {
  id?: number
  name: string
  address?: string
  location_code?: string
  sort_order?: number
}) {
  const res = await apiFetchWithOffline('/api/saveWarehouseLocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteWarehouseLocation(params: { id?: number; location_code?: string }) {
  const res = await apiFetchWithOffline('/api/deleteWarehouseLocation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface ItemCategory {
  id?: number
  name: string
  sort_order?: number
}

export async function getItemCategorySettings() {
  const res = await apiFetchWithOffline('/api/getItemCategorySettings')
  return jsonAsArray<ItemCategory>(await res.json())
}

export async function saveItemCategory(params: {
  id?: number
  name: string
  oldName?: string
  sort_order?: number
}) {
  const res = await apiFetchWithOffline('/api/saveItemCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; queued?: boolean }>
}

export async function deleteItemCategory(params: { id?: number; name?: string }) {
  const res = await apiFetchWithOffline('/api/deleteItemCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string; queued?: boolean }>
}

export async function getItemCategories() {
  const res = await apiFetchWithOffline('/api/getItemCategories')
  return res.json() as Promise<{ categories: string[] }>
}

export async function getAdminVendors() {
  const res = await apiFetchWithOffline('/api/getVendors')
  return jsonAsArray<AdminVendor>(await res.json())
}

export async function saveItem(params: {
  code: string
  name: string
  category?: string
  vendor?: string
  outboundLocation?: string
  spec?: string
  unit?: string
  price?: number
  cost?: number
  totalQuantity?: number | null
  taxType?: string
  imageUrl?: string
  description?: string
  editingCode?: string
  purchaseSource?: 'hq' | 'store'
  stockBaseUnit?: string
  stockUnitOptions?: { unit: string; factor: number }[]
  standardUnits?: { unit: string; totalQuantity: number }[]
  accountSubjectId?: number | null
}) {
  const res = await apiFetchWithOffline('/api/saveItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = (await res.json()) as { success: boolean; message?: string }
  if (json?.success) await invalidateAdminItemsCache().catch(() => {})
  return json
}

export async function deleteItem(params: { code: string }) {
  const res = await apiFetchWithOffline('/api/deleteItem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const json = (await res.json()) as { success: boolean; message?: string }
  if (json?.success) await invalidateAdminItemsCache().catch(() => {})
  return json
}

/** 가격 이력 조회 */
export interface PriceHistoryRow {
  id: number
  entity_type: string
  entity_id: string
  entity_display_name: string | null
  field_name: string
  old_value: number | null
  new_value: number | null
  changed_at: string
  changed_by: string | null
}

export interface PriceScheduleRow {
  id: number
  entity_type: "item" | "pos_menu"
  entity_id: string
  entity_display_name: string | null
  field_name: string
  current_value: number | null
  scheduled_value: number
  status: "pending" | "applied" | "cancelled" | "failed"
  effective_at: string
  created_by: string | null
  created_at: string
  applied_at?: string | null
  cancelled_at?: string | null
  failed_reason?: string | null
}

export async function getPriceHistory(params: {
  entityType?: 'pos_menu' | 'pos_menu_option' | 'item'
  entityId?: string
  menuId?: string
  categoryMain?: string
  category?: string
  from?: string
  to?: string
  search?: string
  limit?: number
}) {
  const searchParams = new URLSearchParams()
  if (params.entityType) searchParams.set('entityType', params.entityType)
  if (params.entityId) searchParams.set('entityId', params.entityId)
  if (params.menuId) searchParams.set('menuId', params.menuId)
  if (params.categoryMain) searchParams.set('categoryMain', params.categoryMain)
  if (params.category) searchParams.set('category', params.category)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.search) searchParams.set('search', params.search)
  if (params.limit != null) searchParams.set('limit', String(params.limit))
  const q = searchParams.toString()
  const res = await apiFetchWithOffline(`/api/getPriceHistory${q ? '?' + q : ''}`)
  const data = await res.json()
  if (!res.ok || (data && typeof data === 'object' && 'error' in data)) {
    console.warn('getPriceHistory:', data?.error || res.status)
    return []
  }
  return Array.isArray(data) ? data : []
}

export async function backfillPriceHistory() {
  const res = await apiFetchWithOffline('/api/backfillPriceHistory', { method: 'POST' })
  const data = await res.json() as { success?: boolean; inserted?: number; error?: string }
  if (!res.ok || !data?.success) {
    return { success: false as const, error: data?.error || '실패', inserted: 0 }
  }
  return { success: true as const, inserted: data.inserted ?? 0, message: `${data.inserted ?? 0}건 등록됨` }
}

/** 가격 이력 복구. targetDate(YYYY-MM-DD) 있으면 해당 날짜 시점 가격으로 메뉴/옵션 복구, 없으면 0/비어있는 것만 복구 */
export async function restoreFromPriceHistory(params?: { targetDate?: string; dryRun?: boolean }) {
  const sp = new URLSearchParams()
  if (params?.dryRun) sp.set('dryRun', '1')
  if (params?.targetDate) sp.set('targetDate', params.targetDate)
  const q = sp.toString()
  const url = q ? `/api/restoreFromPriceHistory?${q}` : '/api/restoreFromPriceHistory'
  const res = await apiFetchWithOffline(url, { method: 'POST' })
  const data = await res.json() as {
    success?: boolean
    message?: string
    restored?: { items: number; menus: number; options: number }
    dryRun?: boolean
    targetDate?: string
    details?: { items: string[]; menus: string[]; options: string[] }
  }
  if (!res.ok || !data?.success) {
    return { success: false as const, error: data?.message || '복구 실패', restored: { items: 0, menus: 0, options: 0 } }
  }
  return {
    success: true as const,
    message: data.message,
    restored: data.restored ?? { items: 0, menus: 0, options: 0 },
    dryRun: data.dryRun,
    targetDate: data.targetDate,
    details: data.details,
  }
}

export async function getPriceSchedules(params: {
  entityType?: "item" | "pos_menu"
  status?: "pending" | "applied" | "cancelled" | "failed"
  search?: string
  category?: string
  limit?: number
}) {
  const sp = new URLSearchParams()
  if (params.entityType) sp.set("entityType", params.entityType)
  if (params.status) sp.set("status", params.status)
  if (params.search) sp.set("search", params.search)
  if (params.category) sp.set("category", params.category)
  if (params.limit != null) sp.set("limit", String(params.limit))
  const q = sp.toString()
  const res = await apiFetchWithOffline(`/api/getPriceSchedules${q ? `?${q}` : ""}`)
  const data = await res.json().catch(() => [])
  if (!res.ok || (data && typeof data === "object" && "error" in data)) return []
  return Array.isArray(data) ? (data as PriceScheduleRow[]) : []
}

export async function savePriceSchedule(params: {
  entityType: "item" | "pos_menu"
  entityId: string
  fieldName: string
  scheduledValue: number
  effectiveAt: string
}) {
  const res = await apiFetchWithOffline("/api/savePriceSchedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({ success: false, message: "저장 실패" }))) as {
    success: boolean
    message?: string
  }
}

export async function cancelPriceSchedule(params: { id: number }) {
  const res = await apiFetchWithOffline("/api/cancelPriceSchedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  return (await res.json().catch(() => ({ success: false, message: "취소 실패" }))) as {
    success: boolean
    message?: string
  }
}

export async function applyDuePriceSchedules() {
  const res = await apiFetchWithOffline("/api/applyDuePriceSchedules", { method: "POST" })
  return (await res.json().catch(() => ({ success: false, message: "실행 실패", appliedCount: 0, failedCount: 0 }))) as {
    success: boolean
    message?: string
    appliedCount: number
    failedCount: number
  }
}

export async function updateItemOrderDisabled(params: { code: string; disabled: boolean }) {
  const res = await apiFetchWithOffline('/api/updateItemOrderDisabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; disabled?: boolean; message?: string }>
}

/** Excel 원가 파일 → 코드가 없는 품목만 신규 등록 */
export async function importItemsFromExcel(file: File) {
  const form = new FormData()
  form.set('file', file)
  const res = await apiFetchWithOffline('/api/importItemsFromExcel', {
    method: 'POST',
    body: form,
  })
  return res.json() as Promise<{ success: boolean; message?: string; added?: number }>
}
