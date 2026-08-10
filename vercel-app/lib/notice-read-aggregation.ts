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
  sender?: string
  created_at?: string
  target_store?: string
  target_role?: string
  target_permission_group?: string | null
  target_recipients?: string | null
}

const TZ = 'Asia/Bangkok'

/** ISO/타임스탬프 → 방콕 YYYY-MM-DD */
export function noticeCreatedYmdBangkok(createdAt: string | null | undefined): string {
  const raw = String(createdAt || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes('T') && raw.length === 10) return raw
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] : ''
  }
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

/**
 * 발송일(방콕)부터 asOfYmd까지 경과한 달력 일수.
 * 당일 발송 = 0일. 예: 3일 전 발송 → 3.
 */
export function bangkokCalendarDaysSinceSend(
  createdAt: string | null | undefined,
  asOfYmd: string
): number {
  const sendYmd = noticeCreatedYmdBangkok(createdAt)
  const asOf = String(asOfYmd || '').trim().slice(0, 10)
  if (!sendYmd || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return -1
  const a = Date.parse(`${sendYmd}T00:00:00+07:00`)
  const b = Date.parse(`${asOf}T00:00:00+07:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1
  return Math.floor((b - a) / 86400000)
}

/** minUnreadDays>0 이면 발송 후 해당 일수 이상 경과한 공지만 집계 대상 */
export function noticeMeetsMinUnreadDays(
  createdAt: string | null | undefined,
  minUnreadDays: number,
  asOfYmd: string
): boolean {
  const n = Math.max(0, Math.floor(Number(minUnreadDays) || 0))
  if (n <= 0) return true
  const days = bangkokCalendarDaysSinceSend(createdAt, asOfYmd)
  return days >= n
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
 * opts.minUnreadDays>0 이면 발송 후 그 일수 이상 지난 공지만 집계(유예기간 제외).
 */
export function aggregateNoticeReadStats(
  notices: NoticeForAggregation[],
  employees: EmpRow[],
  readRows: { notice_id: number; store?: string; name?: string; status?: string }[],
  opts: {
    searchType: 'all' | 'notice' | 'order'
    minUnreadDays?: number
    asOfYmd?: string
  }
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

  const minUnreadDays = Math.max(0, Math.floor(Number(opts.minUnreadDays) || 0))
  const asOfYmd = String(opts.asOfYmd || '').trim().slice(0, 10)
  // 퇴사일이 기준일(또는 방콕 오늘) 이전·당일인 경우만 제외 — 미래 퇴사 예정은 재직으로 집계
  const asOfForResign =
    asOfYmd || new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  const byKey = new Map<string, EmpRow>()
  for (const e of employees) {
    if (!e.name) continue
    const resign = String(e.resignDate || '').trim().slice(0, 10)
    if (resign && resign <= asOfForResign) continue
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
    if (isWorkLogRelatedNotice(n.title || '', n.sender)) continue
    if (opts.searchType === 'order' && !isOrderRelatedNotice(n.title || '', n.content || '')) continue
    if (opts.searchType === 'notice' && isOrderRelatedNotice(n.title || '', n.content || '')) continue
    if (!noticeMeetsMinUnreadDays(n.created_at, minUnreadDays, asOfYmd || noticeCreatedYmdBangkok(n.created_at))) {
      continue
    }

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

export type NoticeUnreadDetailRow = {
  id: number
  title: string
  createdAt: string
  sender: string
}

/**
 * 한 직원이 기간·유형 필터에서 수신 대상인데 미확인인 공지 목록
 * (aggregateNoticeReadStats와 동일 판정)
 */
export function listUnreadNoticesForEmployee(
  notices: (NoticeForAggregation & {
    title?: string
    content?: string
    sender?: string
    created_at?: string
  })[],
  employee: EmpRow,
  readRows: { notice_id: number; store?: string; name?: string; status?: string }[],
  opts: {
    searchType: 'all' | 'notice' | 'order'
    minUnreadDays?: number
    asOfYmd?: string
  }
): NoticeUnreadDetailRow[] {
  const store = String(employee.store || '').trim()
  const name = String(employee.name || '').trim()
  if (!store || !name) return []

  const confirmed = new Set<number>()
  for (const r of readRows) {
    const nid = r.notice_id
    if (!nid) continue
    if (String(r.store || '').trim() !== store) continue
    if (String(r.name || '').trim() !== name) continue
    if (isNoticeReadStatus(String(r.status || '').trim())) confirmed.add(nid)
  }

  const minUnreadDays = Math.max(0, Math.floor(Number(opts.minUnreadDays) || 0))
  const asOfYmd = String(opts.asOfYmd || '').trim().slice(0, 10)

  const out: NoticeUnreadDetailRow[] = []
  for (const n of notices) {
    if (isWorkLogRelatedNotice(n.title || '', n.sender)) continue
    if (opts.searchType === 'order' && !isOrderRelatedNotice(n.title || '', n.content || '')) continue
    if (opts.searchType === 'notice' && isOrderRelatedNotice(n.title || '', n.content || '')) continue
    if (!noticeMeetsMinUnreadDays(n.created_at, minUnreadDays, asOfYmd || noticeCreatedYmdBangkok(n.created_at))) {
      continue
    }

    const specific = parseTargetRecipientKeys(n.target_recipients)
    let targeted = false
    if (specific.length > 0) {
      targeted = specific.some((t) => t.store === store && t.name === name)
    } else {
      targeted = employeeReceivesBroadcast(
        { store, name, job: employee.job, role: employee.role || '' },
        n
      )
    }
    if (!targeted) continue
    if (confirmed.has(n.id)) continue
    out.push({
      id: n.id,
      title: String(n.title || '').trim() || `(#${n.id})`,
      createdAt: String(n.created_at || '').trim(),
      sender: String(n.sender || '').trim(),
    })
  }
  return out
}
