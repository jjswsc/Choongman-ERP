/**
 * 직원별 수신·확인 집계 — getMyNotices 수신 대상 판정과 맞춤(공지 탭/모바일과 동일).
 */
import { isNoticeReadStatus } from '@/lib/notice-read-status'
import { employeeReceivesBroadcast, parseTargetRecipientKeys } from '@/lib/broadcast-notice-target'

export type EmpRow = {
  store: string
  name: string
  job: string
  role: string
  resignDate: string
}

export type NoticeForAggregation = {
  id: number
  title?: string
  content?: string
  target_store?: string
  target_role?: string
  target_permission_group?: string | null
  target_recipients?: string | null
}

/** getSentNotices / admin과 동일한 “물류/주문” 공지 식별 */
export function isOrderRelatedNotice(title: string, content: string): boolean {
  const t = (title || '').toLowerCase()
  const c = (content || '').toLowerCase()
  const text = t + ' ' + c
  if (/주문.*(승인|반려|보류)/.test(t) || /주문\s*#\d+/.test(t)) return true
  if (/강제|출고|발주|입고|재고|배송|물류|수령/.test(text)) return true
  if (/주문.*확인|승인.*화면/.test(c)) return true
  return false
}

/**
 * 업무일지 자동알림 — 직원 수신함에는 남길 수 있으나
 * 공지사항 관리「발송 내역」·발송자 목록·수신 통계에는 포함하지 않음.
 */
export function isWorkLogRelatedNotice(title: string, sender?: string): boolean {
  const t = String(title || '').trim()
  if (t.startsWith('[업무일지]')) return true
  if (String(sender || '').trim() === '업무일지') return true
  return false
}

const empKey = (store: string, name: string) => `${String(store).trim()}|${String(name).trim()}`

const readKey = (noticeId: number, store: string, name: string) =>
  `${noticeId}::${String(store).trim()}::${String(name).trim()}`

/**
 * 직원별: 대상 공지 수(수신) / 확인(확인 버튼)
 */
export function aggregateNoticeReadStats(
  notices: NoticeForAggregation[],
  employees: EmpRow[],
  readRows: { notice_id: number; store?: string; name?: string; status?: string }[],
  opts: { searchType: 'all' | 'notice' | 'order' }
): Map<
  string,
  { store: string; name: string; job: string; targeted: number; confirmed: number }
> {
  const readStatusByKey = new Map<string, string>()
  for (const r of readRows) {
    const nid = r.notice_id
    const s = String(r.store || '').trim()
    const n = String(r.name || '').trim()
    if (!nid || !s || !n) continue
    const k = readKey(nid, s, n)
    const st = String(r.status || '').trim()
    if (isNoticeReadStatus(st)) readStatusByKey.set(k, st)
  }

  const agg = new Map<
    string,
    { store: string; name: string; job: string; targeted: number; confirmed: number }
  >()

  const byKey = new Map<string, EmpRow>()
  for (const e of employees) {
    if (!e.name) continue
    if (e.resignDate && e.resignDate !== '') continue
    if (!e.store || e.store === '매장명' || e.store === 'Store') continue
    byKey.set(empKey(e.store, e.name), e)
  }

  const getAgg = (store: string, name: string, requireRoster: boolean) => {
    const k0 = empKey(store, name)
    const ex = byKey.get(k0)
    if (requireRoster && !ex) return null
    const j = (ex?.job || '').trim() || '—'
    let row = agg.get(k0)
    if (!row) {
      row = { store, name, job: j, targeted: 0, confirmed: 0 }
      agg.set(k0, row)
    } else if (j !== '—' && row.job === '—') row.job = j
    return row
  }

  for (const n of notices) {
    if (isWorkLogRelatedNotice(n.title || '')) continue
    if (opts.searchType === 'order' && !isOrderRelatedNotice(n.title || '', n.content || '')) continue
    if (opts.searchType === 'notice' && isOrderRelatedNotice(n.title || '', n.content || '')) continue

    const specific = parseTargetRecipientKeys(n.target_recipients)
    if (specific.length > 0) {
      for (const t of specific) {
        const a = getAgg(t.store, t.name, false)
        if (!a) continue
        a.targeted += 1
        const st = readStatusByKey.get(readKey(n.id, t.store, t.name)) || ''
        if (isNoticeReadStatus(st)) a.confirmed += 1
      }
    } else {
      for (const e of byKey.values()) {
        if (
          !employeeReceivesBroadcast(
            { store: e.store, name: e.name, job: e.job, role: e.role || '' },
            n
          )
        )
          continue
        const a = getAgg(e.store, e.name, false)
        if (!a) continue
        a.targeted += 1
        const st = readStatusByKey.get(readKey(n.id, e.store, e.name)) || ''
        if (isNoticeReadStatus(st)) a.confirmed += 1
      }
    }
  }

  for (const k of [...agg.keys()]) {
    const a = agg.get(k)!
    if (a.targeted === 0) agg.delete(k)
  }

  return agg
}
