/** 채널 확인 — 일자별 POS vs 통장. 1바트 미만은 일치. */
import { getBangkokDateStr } from '@/lib/pos-business-day'

export const CHANNEL_RECONCILE_MATCH_BAHT = 1

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function parsePosTimestamp(raw: string): Date | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const d = new Date(
    s.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T')
  )
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 채널 확인 POS 일자 — 방콕 달력일.
 * 결제일(`paid_at`)이 있으면 그걸 쓰고, 없으면 주문 생성 시각.
 * 시재·마감용 영업일과 다를 수 있음(자정 이후).
 */
export function channelReconcilePosCalendarDate(row: {
  paid_at?: string | null
  created_at?: string | null
}): string {
  const raw = String(row.paid_at || row.created_at || '').trim()
  const d = parsePosTimestamp(raw)
  if (d) return getBangkokDateStr(d)
  const prefix = raw.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(prefix) ? prefix : ''
}

export function filterRowsByChannelReconcileCalendarRange<
  T extends { paid_at?: string | null; created_at?: string | null },
>(rows: T[], startYmd: string, endYmd: string): T[] {
  const lo = String(startYmd || '').trim().slice(0, 10)
  const hi = String(endYmd || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lo) || !/^\d{4}-\d{2}-\d{2}$/.test(hi)) return []
  const loEff = lo <= hi ? lo : hi
  const hiEff = lo <= hi ? hi : lo
  return rows.filter((r) => {
    const d = channelReconcilePosCalendarDate(r)
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= loEff && d <= hiEff
  })
}

/**
 * 통장 거래 「인식일」.
 * 입금의 sales_date가 있으면 그 날짜, 없으면 통장 화면과 같이 입금일 전날.
 * 카드·배달앱·현금(익일 입금)용. QR(4130)은 `bankQrDepositDate`.
 */
export function bankDepositRecognitionDate(row: {
  transDate?: string | null
  salesDate?: string | null
}): string {
  const sales = String(row.salesDate || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(sales)) return sales
  const trans = String(row.transDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trans)) return ''
  return addDaysToYmd(trans, -1)
}

/** KBank QR(4130) — PromptPay는 당일 입금이 많아 입금일을 그대로 씀. 저장된 인식일(T-1)은 무시. */
export function bankQrDepositDate(row: { transDate?: string | null }): string {
  const trans = String(row.transDate || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(trans) ? trans : ''
}

/** 통장 가져오기 인식일 기본값. QR(4130)만 입금일과 같게. */
export function isSameDayBankDepositSalesDate(params: {
  category?: string | null
  accountSubjectCode?: string | null
}): boolean {
  if (String(params.category || '').trim().toLowerCase() === 'revenue_qr') return true
  return String(params.accountSubjectCode || '').trim() === '4130'
}

export function defaultBankDepositSalesDate(
  transDate: string,
  opts?: { sameDay?: boolean }
): string {
  const ymd = String(transDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  if (opts?.sameDay) return ymd
  return addDaysToYmd(ymd, -1)
}

export function defaultBankDepositSalesDateForRow(params: {
  transDate: string
  category?: string | null
  accountSubjectCode?: string | null
}): string {
  return defaultBankDepositSalesDate(params.transDate, {
    sameDay: isSameDayBankDepositSalesDate(params),
  })
}

/** 통장이 없으면 POS가 1바트 이상일 때 불일치. 둘 다 있으면 |통장−POS| ≥ 1이면 불일치. */
export function isChannelReconcileDayMismatch(
  posAmt: number,
  bankAmt: number | null | undefined
): boolean {
  const pos = Number(posAmt) || 0
  if (bankAmt == null) return Math.abs(pos) >= CHANNEL_RECONCILE_MATCH_BAHT
  return Math.abs((Number(bankAmt) || 0) - pos) >= CHANNEL_RECONCILE_MATCH_BAHT
}

export function channelReconcileMismatchDates(
  days: Array<{ date: string; posAmt: number; bankAmt: number | null | undefined }>
): string[] {
  return days
    .filter((d) => isChannelReconcileDayMismatch(d.posAmt, d.bankAmt))
    .map((d) => d.date)
}
