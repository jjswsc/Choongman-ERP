/** 채널 확인 — 일자별 POS vs 통장. 1바트 미만은 일치. */

export const CHANNEL_RECONCILE_MATCH_BAHT = 1

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
