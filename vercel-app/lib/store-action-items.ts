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

export type StoreActionCategory = (typeof STORE_ACTION_CATEGORIES)[number]

/** 카테고리별 기본 완료 기한(일) — 레거시·표시용. 신규 자동 채움은 horizon 우선 */
export const STORE_ACTION_CATEGORY_DUE_DAYS: Record<StoreActionCategory, number> = {
  인력: 3,
  교육: 7,
  청결: 1,
  "재고·발주": 2,
  "레시피·품질": 3,
  서비스: 3,
  시설연계: 7,
  기타: 3,
}

export function storeActionDefaultDueDays(category: string): number {
  return STORE_ACTION_CATEGORY_DUE_DAYS[category as StoreActionCategory] ?? 3
}

/**
 * 과제 기간 성격
 * - day: 당일(오늘)
 * - week: 주간(+7일)
 * - month_30: 월간·앞으로 30일
 * - month_cal: 월간·해당 달력 월 말일
 * 레거시 `month` 값은 normalize 시 month_30으로 본다.
 */
export const STORE_ACTION_HORIZONS = ["day", "week", "month_30", "month_cal"] as const

export type StoreActionHorizon = (typeof STORE_ACTION_HORIZONS)[number]

export const STORE_ACTION_HORIZON_DUE_DAYS: Record<"day" | "week" | "month_30", number> = {
  day: 0,
  week: 7,
  month_30: 30,
}

export function isStoreActionHorizon(v: string): v is StoreActionHorizon {
  return (STORE_ACTION_HORIZONS as readonly string[]).includes(v)
}

export function normalizeStoreActionHorizon(v: unknown): StoreActionHorizon {
  const s = String(v || "").trim().toLowerCase()
  if (s === "month") return "month_30"
  return isStoreActionHorizon(s) ? s : "week"
}

/** 고정 일수 horizon만. month_cal은 NaN(말일 기준). */
export function storeActionHorizonDueDays(horizon: string): number {
  const h = normalizeStoreActionHorizon(horizon)
  if (h === "month_cal") return Number.NaN
  return STORE_ACTION_HORIZON_DUE_DAYS[h]
}

/** 방콕 기준 해당 달력 월의 마지막 날 YYYY-MM-DD */
export function storeActionEndOfCalendarMonth(todayYmd: string): string {
  const base = String(todayYmd || "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return ""
  const [y, m] = base.split("-").map((x) => Number(x))
  if (!y || !m) return ""
  const d = new Date(Date.UTC(y, m, 0, 5, 0, 0))
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

/** todayYmd(YYYY-MM-DD, 방콕) + horizon → 완료 기한 */
export function storeActionDueDateForHorizon(horizon: string, todayYmd: string): string {
  const base = String(todayYmd || "").trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return ""
  const h = normalizeStoreActionHorizon(horizon)
  if (h === "month_cal") return storeActionEndOfCalendarMonth(base)
  const days = STORE_ACTION_HORIZON_DUE_DAYS[h]
  const d = new Date(`${base}T12:00:00+07:00`)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

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

/** 점검 FAIL 항목 키 — 번역 전 원문 경로(대분류 > 중분류 > 항목) */
export function storeCheckItemKey(main: string, sub: string, name: string): string {
  return [main, sub, name]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" > ")
    .slice(0, 200)
}

export function normalizeTitleKey(title: string): string {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80)
}
