/** 매장 개선 과제(CAPA) — 상태·카테고리·기한초과 공통 */

export const STORE_ACTION_STATUSES = [
  "open",
  "in_progress",
  "pending_verify",
  "completed",
  "cancelled",
] as const

export type StoreActionStatus = (typeof STORE_ACTION_STATUSES)[number]

export const STORE_ACTION_OPEN_STATUSES: StoreActionStatus[] = [
  "open",
  "in_progress",
  "pending_verify",
]

export const STORE_ACTION_CATEGORIES = [
  "인력",
  "교육",
  "청결",
  "재고·발주",
  "레시피·품질",
  "서비스",
  "시설연계",
  "기타",
] as const

export const STORE_ACTION_PRIORITIES = ["긴급", "보통", "낮음"] as const

export const STORE_ACTION_SOURCE_TYPES = ["manual", "visit", "check_fail", "hq"] as const

export type StoreActionSourceType = (typeof STORE_ACTION_SOURCE_TYPES)[number]

export function isStoreActionStatus(v: string): v is StoreActionStatus {
  return (STORE_ACTION_STATUSES as readonly string[]).includes(v)
}

export function isStoreActionOpenStatus(status: string): boolean {
  return STORE_ACTION_OPEN_STATUSES.includes(status as StoreActionStatus)
}

/** due_date(YYYY-MM-DD)가 오늘(방콕 YMD)보다 이전이면 기한초과. completed/cancelled 제외. */
export function isStoreActionOverdue(params: {
  status: string
  dueDate: string | null | undefined
  todayYmd: string
}): boolean {
  if (!isStoreActionOpenStatus(params.status)) return false
  const due = String(params.dueDate || "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false
  return due < String(params.todayYmd || "").trim().slice(0, 10)
}

export function normalizeStoreActionPhotoUrls(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((u) => String(u || "").trim()).filter(Boolean)
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as unknown
      if (Array.isArray(j)) return j.map((u) => String(u || "").trim()).filter(Boolean)
    } catch {
      return raw.trim() ? [raw.trim()] : []
    }
  }
  return []
}

export function normalizeTitleKey(title: string): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80)
}
