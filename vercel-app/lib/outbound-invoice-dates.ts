/**
 * 출고 Invoice/Tax invoice 날짜.
 * Outbound Entry: Outbound Date → Issue Date, Delivery Date → Due Date.
 */

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function ymdFromMaybeDateTime(raw: string | undefined | null): string {
  const s = String(raw || "")
    .trim()
    .slice(0, 10)
  return YMD_RE.test(s) ? s : ""
}

/** 품목 deliveryDate 중 유효 YYYY-MM-DD (여러 개면 가장 늦은 날). */
export function pickOutboundDeliveryDueDate(
  deliveryDates: Array<string | undefined | null> | undefined
): string {
  const ymds = [
    ...new Set(
      (deliveryDates || [])
        .map((d) => ymdFromMaybeDateTime(d))
        .filter(Boolean)
    ),
  ].sort()
  return ymds.length ? ymds[ymds.length - 1]! : ""
}

export function resolveOutboundInvoiceDates(params: {
  /** 출고일·문서일 후보 (앞에서부터 첫 유효값) */
  issueDateCandidates?: Array<string | undefined | null>
  deliveryDates?: Array<string | undefined | null>
  fallbackYmd?: string
}): { issueDate: string; dueDate: string } {
  const issueDate =
    (params.issueDateCandidates || [])
      .map((c) => ymdFromMaybeDateTime(c))
      .find(Boolean) ||
    ymdFromMaybeDateTime(params.fallbackYmd) ||
    ""
  const dueFromDelivery = pickOutboundDeliveryDueDate(params.deliveryDates)
  const dueDate = dueFromDelivery || issueDate
  return { issueDate, dueDate }
}
