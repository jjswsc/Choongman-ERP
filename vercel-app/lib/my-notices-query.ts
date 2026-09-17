/**
 * 모바일/ERP 수신 공지 조회 — DB에서 기간을 먼저 거른 뒤 limit.
 * (최신 N건을 가져온 다음 날짜 필터하면 기간 밖·과거 HQ 공지가 통째로 빠짐)
 */
import { addBangkokCalendarDays } from '@/lib/bangkok-time'
import { bangkokInclusivePeriod, bangkokTodayYmd, bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'

/** PostgREST notices 조회 상한 — 기간 필터 적용 후 최근순 */
export const MY_NOTICES_DB_FETCH_LIMIT = 1200

/** dateFrom/dateTo 없을 때(미확인 건수 등) 방콕 달력 포함 일수 */
export const MY_NOTICES_DEFAULT_LOOKBACK_DAYS = 90

/** ERP unread_or_in_range: 선택 기간보다 이전 미확인을 넣기 위한 추가 일수 */
export const MY_NOTICES_UNREAD_EXTRA_LOOKBACK_DAYS = 180

export type MyNoticesListMode = 'default' | 'unread_or_in_range'

export type MyNoticesDateQuery = {
  listMode: MyNoticesListMode
  dateFrom?: string
  dateTo?: string
  rangeStart?: string
  rangeEnd?: string
  /** 테스트용. 없으면 방콕 오늘 */
  todayYmd?: string
}

function ymd(raw: string | undefined): string {
  const s = String(raw || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** 방콕 달력 구간 → PostgREST created_at 조건 */
export function resolveMyNoticesCreatedAtBounds(opts: MyNoticesDateQuery): {
  startYmd: string
  endYmd: string
} {
  const today = ymd(opts.todayYmd) || bangkokTodayYmd()

  if (opts.listMode === 'unread_or_in_range') {
    const rs = ymd(opts.rangeStart)
    const re = ymd(opts.rangeEnd)
    const endYmd = re || today
    const anchor = rs || endYmd
    let startYmd = addBangkokCalendarDays(anchor, -MY_NOTICES_UNREAD_EXTRA_LOOKBACK_DAYS)
    if (rs && rs < startYmd) startYmd = rs
    return { startYmd, endYmd }
  }

  let startYmd = ymd(opts.dateFrom)
  let endYmd = ymd(opts.dateTo)
  if (!startYmd && !endYmd) {
    const period = bangkokInclusivePeriod(today, MY_NOTICES_DEFAULT_LOOKBACK_DAYS)
    return { startYmd: period.startYmd, endYmd: period.endYmd }
  }
  if (startYmd && !endYmd) endYmd = today
  if (!startYmd && endYmd) {
    startYmd = bangkokInclusivePeriod(endYmd, MY_NOTICES_DEFAULT_LOOKBACK_DAYS).startYmd
  }
  if (startYmd > endYmd) {
    const tmp = startYmd
    startYmd = endYmd
    endYmd = tmp
  }
  return { startYmd, endYmd }
}

export function buildMyNoticesDbFilter(opts: MyNoticesDateQuery): string {
  const { startYmd, endYmd } = resolveMyNoticesCreatedAtBounds(opts)
  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startYmd, endYmd)
  return `id=gte.0&created_at=gte.${gteIso}&created_at=lte.${lteIso}`
}
