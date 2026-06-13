import type { ReceivablePayableItem } from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"

export type AgingBucketKey = "current" | "days_31_60" | "days_61_90" | "over_90"

export type AgingBuckets = Record<AgingBucketKey, number>

export const AGING_BUCKET_ORDER: AgingBucketKey[] = [
  "current",
  "days_31_60",
  "days_61_90",
  "over_90",
]

const RECEIVABLE_ACCRUAL_REF = new Set(["Opening", "Order", "AccountingPO", "ForceOutbound"])
const PAYABLE_ACCRUAL_REF = new Set(["Opening", "PO"])

/** 방콕 달력 기준 일수 차이 (asOf − transDate) */
export function agingDaysBetween(asOfYmd: string, transYmd: string): number {
  const asOf = String(asOfYmd || "").slice(0, 10)
  const trans = String(transYmd || "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !/^\d{4}-\d{2}-\d{2}$/.test(trans)) return 0
  const startUtc = new Date(`${trans}T00:00:00+07:00`).getTime()
  const endUtc = new Date(`${asOf}T00:00:00+07:00`).getTime()
  if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc)) return 0
  return Math.max(0, Math.round((endUtc - startUtc) / 86400000))
}

export function agingBucketForDays(days: number): AgingBucketKey {
  if (days <= 30) return "current"
  if (days <= 60) return "days_31_60"
  if (days <= 90) return "days_61_90"
  return "over_90"
}

export function isAccrualRefType(
  refType: string | undefined,
  ledger: "receivable" | "payable"
): boolean {
  const ref = String(refType || "").trim()
  if (!ref) return false
  return ledger === "receivable" ? RECEIVABLE_ACCRUAL_REF.has(ref) : PAYABLE_ACCRUAL_REF.has(ref)
}

export function emptyAgingBuckets(): AgingBuckets {
  return { current: 0, days_31_60: 0, days_61_90: 0, over_90: 0 }
}

/** 미수·미지급 발생 행(양수 금액)을 거래일 기준 aging 버킷에 합산 */
export function computeLedgerAging(
  listData: ReceivablePayableItem[],
  ledger: "receivable" | "payable",
  asOfYmd?: string
): { buckets: AgingBuckets; total: number; openLineCount: number } {
  const asOf = (asOfYmd || getBangkokTodayDateString()).slice(0, 10)
  const buckets = emptyAgingBuckets()
  let total = 0
  let openLineCount = 0

  for (const item of listData) {
    for (const row of item.items ?? []) {
      if (!isAccrualRefType(row.ref_type, ledger)) continue
      const amount = Number(row.amount ?? 0)
      if (amount <= 0) continue
      const days = agingDaysBetween(asOf, row.trans_date || asOf)
      const bucket = agingBucketForDays(days)
      buckets[bucket] += amount
      total += amount
      openLineCount += 1
    }
  }

  return { buckets, total, openLineCount }
}

export function agingRowToneClass(days: number): string {
  if (days <= 30) return ""
  if (days <= 60) return "bg-amber-50/60 dark:bg-amber-950/20"
  if (days <= 90) return "bg-orange-50/70 dark:bg-orange-950/25"
  return "bg-red-50/60 dark:bg-red-950/25"
}
