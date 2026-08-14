/** 채널 확인 — 일자별 POS vs 통장. 1바트 미만은 일치. */

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

/**
 * 통장 거래 「인식일」.
 * 입금의 sales_date가 있으면 그 날짜, 없으면 통장 화면과 같이 입금일 전날.
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
