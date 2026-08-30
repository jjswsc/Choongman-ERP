/**
 * leave_requests 집계·신청 공통 (날짜 방콕 기준, 타입별 일수)
 */

import { normalizeEmployeeNameFields } from '@/lib/employee-display-name'
import { isEffectivelyResignedForStaffRollup } from '@/lib/erp-store-master-shared'

const BANGKOK = 'Asia/Bangkok'

/** DB leave_date → 방콕 달력 YYYY-MM-DD (timestamptz가 UTC로만 올 때 날짜 밀림 방지) */
export function toLeaveDateStrBangkok(val: string | Date | null | undefined): string {
  if (val == null || val === '') return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s)
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-CA', { timeZone: BANGKOK })
      }
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    return ''
  }
  const d = new Date(val as Date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: BANGKOK })
}

export function isApprovedLeaveStatus(status: string): boolean {
  const s = String(status || '').trim()
  return s === '승인' || s === 'Approved' || s === 'อนุมัติ'
}

/** 반차·Half = 0.5일 (무급휴가(반차) 등 복합 문자열 포함) — `half` 단어 단위만 (다른 단어 부분일치 방지) */
export function getLeaveDayValueFromType(type: string): number {
  const t = String(type || '').trim()
  if (t.indexOf('반차') !== -1) return 0.5
  if (/\bhalf\b/i.test(t)) return 0.5
  return 1
}

/** 입사 1년 미만 시 유급 연차 → 무급 처리 대상 타입 (연차·반차·태국 연차·영문) */
export function isAnnualLeaveFamilyType(type: string): boolean {
  const t = String(type || '').trim()
  if (t.indexOf('연차') !== -1 || t.indexOf('반차') !== -1) return true
  if (t.indexOf('ลาพักร้อน') !== -1) return true
  return /\bannual\b/i.test(t) || /\bhalf\b/i.test(t)
}

/** 매장명: 집계 시 대소문자만 무시 (공백 정규화) */
export function normalizeLeaveMatchKey(s: string): string {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** 연속 공백 정리 + trim (비교 직전 공통) */
export function strictLeavePersonNameKey(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

/**
 * 휴가 집계용 인물 키: 직원 마스터(name + name_title) 또는 과거 휴가 행(이름에 Mr./Ms. 포함)을
 * 동일 규칙으로 베어 이름만 남겨 비교 — 호칭 컬럼 분리 전후 데이터 호환.
 */
export function leavePersonKeyForLeaveStats(rawName: string, rawTitle?: string | null): string {
  let { name } = normalizeEmployeeNameFields(String(rawName || ''), String(rawTitle ?? '').trim())
  // 휴가 신청 쪽에만 붙는 태국식 호칭 (직원 마스터에는 없을 수 있음)
  name = String(name || '')
    .replace(/^คุณ\s+/u, '')
    .replace(/^Khun\.?\s+/i, '')
    .trim()
  return strictLeavePersonNameKey(name)
}

/** 편집 거리 (이름 오타 보정용, 짧은 문자열 전용) */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + cost)
      prev = tmp
    }
  }
  return dp[n]!
}

/**
 * 직원 키와 휴가 행 이름 키가 동일 인물로 볼 수 있는지 (오타·철자 차 허용).
 * - 긴 전체 이름(≥12자): 전체 문자열 편집거리 허용치 완화 (Monrada/Amonrada + 성 스펠링 차 등)
 * - 토큰 2개 이상: (기존) 첫 토큰 일치 + 나머지 ≤2, 또는 첫·뒤 토큰 각각 소폭 오타 허용
 * - 토큰 1개: 길이에 비례한 편집거리
 */
export function bareNameFuzzySameForLeaveStats(leaveKey: string, empKey: string): boolean {
  const x = strictLeavePersonNameKey(leaveKey)
  const y = strictLeavePersonNameKey(empKey)
  if (!x || !y) return false
  if (x === y) return true
  const xl = x.toLowerCase()
  const yl = y.toLowerCase()
  const ta = x.split(/\s+/).filter(Boolean)
  const tb = y.split(/\s+/).filter(Boolean)
  const maxLen = Math.max(x.length, y.length)
  const fullThresh = Math.min(8, Math.max(3, Math.floor(maxLen / 3)))

  if (maxLen >= 12 && levenshtein(xl, yl) <= fullThresh) return true

  if (ta.length >= 2 && tb.length >= 2) {
    if (ta[0].toLowerCase() === tb[0].toLowerCase()) {
      const ra = ta.slice(1).join(' ')
      const rb = tb.slice(1).join(' ')
      if (ra.length >= 3 && rb.length >= 3 && levenshtein(ra, rb) <= 2) return true
    }
    if (ta[0].length >= 3 && tb[0].length >= 3) {
      if (levenshtein(ta[0].toLowerCase(), tb[0].toLowerCase()) <= 2) {
        const ra = ta.slice(1).join(' ')
        const rb = tb.slice(1).join(' ')
        if (ra.length >= 2 && rb.length >= 2 && levenshtein(ra, rb) <= 3) return true
      }
    }
  }
  if (ta.length === 1 && tb.length === 1) {
    const u = ta[0]!
    const v = tb[0]!
    const ml = Math.max(u.length, v.length)
    const th = Math.min(5, Math.max(2, Math.floor(ml / 3)))
    return ml >= 4 && levenshtein(u.toLowerCase(), v.toLowerCase()) <= th
  }
  return false
}

type EmpRowLike = { id?: number; store?: string; name?: string; name_title?: string | null }

/**
 * 휴가 1건을 직원 1명에만 귀속 (통계 이중 집계 방지).
 * 0) leave_requests.employee_id가 있으면 같은 매장·같은 id 직원 우선
 * 1) 같은 매장 + 베어 이름 정확 일치 → 유일하면 그 직원
 * 2) 정확 일치 없으면 fuzzy — 후보가 정확히 1명일 때만 (동명·유사명 충돌 시 제외)
 */
export function assignLeaveRowToEmployeeForStats(
  leaveStore: string,
  leaveName: string,
  leaveEmployeeId: number | null | undefined,
  empRows: EmpRowLike[]
): EmpRowLike | null {
  const lsk = normalizeLeaveMatchKey(leaveStore)
  const idNum =
    leaveEmployeeId != null && Number.isFinite(Number(leaveEmployeeId))
      ? Math.floor(Number(leaveEmployeeId))
      : 0
  if (idNum > 0) {
    const byId = empRows.find(
      (e) => Number(e.id) === idNum && normalizeLeaveMatchKey(String(e.store || '')) === lsk
    )
    if (byId) return byId
  }
  const lk = leavePersonKeyForLeaveStats(leaveName, '')
  const inStore = empRows.filter((e) => normalizeLeaveMatchKey(String(e.store || '')) === lsk)
  if (inStore.length === 0) return null

  const exact = inStore.filter(
    (e) => leavePersonKeyForLeaveStats(String(e.name || ''), e.name_title) === lk
  )
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) return exact[0]!

  const fuzzy = inStore.filter((e) =>
    bareNameFuzzySameForLeaveStats(lk, leavePersonKeyForLeaveStats(String(e.name || ''), e.name_title))
  )
  if (fuzzy.length === 1) return fuzzy[0]!
  if (fuzzy.length > 1) {
    const empKeyLower = (e: EmpRowLike) =>
      leavePersonKeyForLeaveStats(String(e.name || ''), e.name_title).toLowerCase()
    const lkLow = lk.toLowerCase()
    const scored = fuzzy
      .map((e) => ({ e, sc: levenshtein(lkLow, empKeyLower(e)) }))
      .sort((a, b) => a.sc - b.sc)
    const maxL = Math.max(lk.length, ...fuzzy.map((e) => empKeyLower(e).length))
    const maxDist = Math.min(8, Math.max(3, Math.floor(maxL / 3)))
    const best = scored[0]!
    const second = scored[1]!
    if (best.sc > maxDist) return null
    if (best.sc < second.sc) return best.e
    return null
  }
  return null
}

/** employees ↔ leave_requests 집계 매칭 (매장·이름 정확 일치) */
export function leaveRowMatchesEmployeeForStats(
  empStore: string,
  empName: string,
  empNameTitle: string | null | undefined,
  leaveStore: string,
  leaveName: string
): boolean {
  return (
    normalizeLeaveMatchKey(empStore) === normalizeLeaveMatchKey(leaveStore) &&
    leavePersonKeyForLeaveStats(empName, empNameTitle) === leavePersonKeyForLeaveStats(leaveName, '')
  )
}

/** 휴가 통계 직원 범위. 기본은 재직자만. */
export type LeaveStatsStaffFilter = 'active' | 'resigned' | 'all'

export function parseLeaveStatsStaffFilter(raw: string | null | undefined): LeaveStatsStaffFilter {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'resigned' || v === 'all') return v
  return 'active'
}

/**
 * 휴가 통계 목록에 올릴 직원인지.
 * soft-delete는 범위와 무관하게 제외. 퇴사 예정(미래 퇴사일)은 재직으로 포함.
 */
export function isEmployeeIncludedInLeaveStats(
  emp: {
    deleted_at?: string | null
    employment_status?: string | null
    resign_date?: string | null
  },
  staffFilter: LeaveStatsStaffFilter = 'active'
): boolean {
  if (String(emp.deleted_at || '').trim()) return false
  const resigned = isEffectivelyResignedForStaffRollup(emp.employment_status, emp.resign_date)
  if (staffFilter === 'all') return true
  if (staffFilter === 'resigned') return resigned
  return !resigned
}

/** YYYY-MM-DD 문자열 기준 기간 포함 (서버 타임존과 무관) */
export function leaveDateInYmdRange(dateStr: string, startYmd: string, endYmd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const lo = /^\d{4}-\d{2}-\d{2}$/.test(startYmd) ? startYmd : '1900-01-01'
  const hi = /^\d{4}-\d{2}-\d{2}$/.test(endYmd) ? endYmd : '2999-12-31'
  return dateStr >= lo && dateStr <= hi
}
