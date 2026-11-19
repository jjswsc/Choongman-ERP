/**
 * notice_reads → 직원별 확인 상태 조회.
 * 매장 표기(CM / 대소문자·공백) 차이와, 과거 name-only 저장 행을 흡수한다.
 */
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isNoticeReadStatus } from '@/lib/notice-read-status'

export type NoticeReadLookupRow = {
  notice_id: number
  store?: string
  name?: string
  status?: string
}

/**
 * 한 공지에 대해 이 직원의 확인 status를 고른다.
 * 우선순위: 매장 일치 → 이름만 일치하는 확인 행(폴백)
 */
export function resolveNoticeReadStatusForEmployee(
  rows: NoticeReadLookupRow[],
  noticeId: number,
  myStore: string,
  myName: string
): string {
  const nid = Number(noticeId)
  const store = String(myStore || '').trim()
  const name = String(myName || '').trim()
  if (!Number.isFinite(nid) || nid <= 0 || !name) return ''

  let fallback = ''
  for (const r of rows) {
    if (Number(r.notice_id) !== nid) continue
    if (String(r.name || '').trim() !== name) continue
    const st = String(r.status || '').trim()
    const rs = String(r.store || '').trim()
    if (rs && (rs === store || storesMatchForGradeLookup(rs, store))) {
      if (isNoticeReadStatus(st)) return st || '확인'
      if (!fallback) fallback = st
    } else if (!fallback && isNoticeReadStatus(st)) {
      // 매장 문자열이 달라도 같은 이름이 확인한 행이 있으면 폴백(모바일 저장 드리프트)
      fallback = st || '확인'
    }
  }
  return fallback
}

/** notice_id → status 맵 (직원 1명 기준) */
export function buildNoticeReadStatusMap(
  rows: NoticeReadLookupRow[],
  myStore: string,
  myName: string
): Record<number, string> {
  const out: Record<number, string> = {}
  const ids = new Set<number>()
  for (const r of rows) {
    const nid = Number(r.notice_id)
    if (Number.isFinite(nid) && nid > 0) ids.add(nid)
  }
  for (const nid of ids) {
    const st = resolveNoticeReadStatusForEmployee(rows, nid, myStore, myName)
    if (st) out[nid] = st
  }
  return out
}

/** 집계용: 직원이 해당 공지를 확인했는지 (매장 변형·이름 폴백) */
export function employeeHasConfirmedNoticeRead(
  rows: NoticeReadLookupRow[],
  noticeId: number,
  store: string,
  name: string
): boolean {
  return isNoticeReadStatus(resolveNoticeReadStatusForEmployee(rows, noticeId, store, name))
}
