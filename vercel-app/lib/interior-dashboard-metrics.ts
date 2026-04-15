/** 인테리어 대시보드·배지용 순수 계산 (방콕 일자 기준) */

export function bangkokTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

export function isInteriorWorkPackageScheduleRisk(
  wp: {
    endDate?: string | null
    status?: string | null
  },
  todayYmd: string
): boolean {
  const st = String(wp.status || "")
  if (st === "done" || st === "cancelled") return false
  const end = wp.endDate ? String(wp.endDate).slice(0, 10) : ""
  if (!end || end.length < 10) return false
  return end < todayYmd
}

type VendorRow = {
  status?: string | null
  paymentDueDate?: string | null
  paymentPaidDate?: string | null
  materialEtaDate?: string | null
  materialReceivedDate?: string | null
  workCompletedDate?: string | null
}

/** vendors/page.tsx getDelayReasonKey 와 동일 조건 */
export function isInteriorVendorTrackDelayed(item: VendorRow, todayYmd: string): boolean {
  const status = String(item.status || "")
  if (status === "done" || status === "cancelled") return false

  if (item.paymentDueDate && !item.paymentPaidDate && item.paymentDueDate < todayYmd) {
    return true
  }
  if (item.materialEtaDate && !item.materialReceivedDate && item.materialEtaDate < todayYmd) {
    return true
  }
  if (item.workCompletedDate && status !== "done" && item.workCompletedDate < todayYmd) {
    return true
  }
  return false
}
