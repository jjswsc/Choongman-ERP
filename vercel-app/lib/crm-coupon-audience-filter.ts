import {
  addBangkokCalendarDays,
  addBangkokCalendarYears,
  getBangkokTodayDateString,
} from '@/lib/bangkok-time'

function toText(v: unknown): string {
  return String(v ?? '').trim()
}

function toUpper(v: unknown): string {
  return toText(v).toUpperCase()
}

function toInt(v: unknown, fallback = 0): number {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? n : fallback
}

function isYmd(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/** 연령 → birth_date 범위 (방콕 오늘 기준). ageMin/ageMax는 만 나이. */
export function birthDateBoundsForAge(ageMin?: number, ageMax?: number): { gte?: string; lte?: string } {
  const today = getBangkokTodayDateString()
  const out: { gte?: string; lte?: string } = {}
  if (ageMin != null && Number.isFinite(ageMin) && ageMin >= 0) {
    out.lte = addBangkokCalendarYears(today, -Math.trunc(ageMin))
  }
  if (ageMax != null && Number.isFinite(ageMax) && ageMax >= 0) {
    out.gte = addBangkokCalendarDays(addBangkokCalendarYears(today, -(Math.trunc(ageMax) + 1)), 1)
  }
  return out
}

/** 프로필 조건(성별·나이·가입일·매장·등급) → PostgREST members 필터 */
export function buildMemberProfileFilterQuery(payload: Record<string, unknown>): string {
  const parts = ['status=eq.active']
  const gender = toUpper(payload.gender)
  if (gender === 'M' || gender === 'F') {
    parts.push(`gender=eq.${gender}`)
  }
  const tierCode = toUpper(payload.tierCode)
  if (tierCode) {
    parts.push(`tier_code=eq.${encodeURIComponent(tierCode)}`)
  }
  const joinStore = toText(payload.joinStoreCode)
  if (joinStore) {
    parts.push(`join_store_code=eq.${encodeURIComponent(joinStore)}`)
  }
  const joinFrom = toText(payload.joinFrom)
  const joinTo = toText(payload.joinTo)
  if (isYmd(joinFrom)) {
    parts.push(`created_at=gte.${encodeURIComponent(`${joinFrom}T00:00:00`)}`)
  }
  if (isYmd(joinTo)) {
    parts.push(`created_at=lte.${encodeURIComponent(`${joinTo}T23:59:59`)}`)
  }
  let ageMin = payload.ageMin != null && toText(payload.ageMin) !== '' ? toInt(payload.ageMin, -1) : -1
  let ageMax = payload.ageMax != null && toText(payload.ageMax) !== '' ? toInt(payload.ageMax, -1) : -1
  if (ageMin >= 0 && ageMax >= 0 && ageMin > ageMax) {
    const tmp = ageMin
    ageMin = ageMax
    ageMax = tmp
  }
  const bounds = birthDateBoundsForAge(ageMin >= 0 ? ageMin : undefined, ageMax >= 0 ? ageMax : undefined)
  if (bounds.gte) parts.push(`birth_date=gte.${bounds.gte}`)
  if (bounds.lte) parts.push(`birth_date=lte.${bounds.lte}`)
  return parts.join('&')
}
