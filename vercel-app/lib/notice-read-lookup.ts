/**
 * notice_reads → 직원별 확인 상태 조회.
 * 매장 표기(CM / 대소문자·공백) 차이만 흡수한다.
 * 같은 이름이 다른 매장에 있을 수 있어, 매장 불일치 행은 절대 확인으로 치지 않는다.
 */
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { noticePersonNamesMatch } from '@/lib/notice-person-key'
import { isNoticeReadStatus } from '@/lib/notice-read-status'

export type NoticeReadLookupRow = {
  notice_id: number
  store?: string
  name?: string
  status?: string
}

/**
 * 한 공지에 대해 이 직원의 확인 status.
 * 우선: 매장 일치(변형 포함) + 이름 일치 + 확인 상태.
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
  if (!Number.isFinite(nid) || nid <= 0 || !name || !store) return ''

  let nonConfirm = ''
  for (const r of rows) {
    if (Number(r.notice_id) !== nid) continue
    if (!noticePersonNamesMatch(String(r.name || ''), name)) continue
    const rs = String(r.store || '').trim()
    if (!rs || !(rs === store || storesMatchForGradeLookup(rs, store))) continue
    const st = String(r.status || '').trim()
    if (isNoticeReadStatus(st)) return st || '확인'
    if (!nonConfirm) nonConfirm = st
  }
  return nonConfirm
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

/** 집계용: 직원이 해당 공지를 확인했는지 */
export function employeeHasConfirmedNoticeRead(
  rows: NoticeReadLookupRow[],
  noticeId: number,
  store: string,
  name: string
): boolean {
  return isNoticeReadStatus(resolveNoticeReadStatusForEmployee(rows, noticeId, store, name))
}
