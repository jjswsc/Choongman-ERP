"use client"

import { MetricCard } from "@/components/cost-analysis/metric-card"
import {
  AccountingStatGrid,
  AccountingStatCard,
} from "@/components/admin/accounting-result-primitives"
import {
  AGING_BUCKET_ORDER,
  type AgingBucketKey,
  type AgingBuckets,
} from "@/lib/receivable-aging"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

const BUCKET_LABEL_KEY: Record<AgingBucketKey, string> = {
  current: "acct_aging_bucket_current",
  days_31_60: "acct_aging_bucket_31_60",
  days_61_90: "acct_aging_bucket_61_90",
  over_90: "acct_aging_bucket_over_90",
}

const BUCKET_TONE: Record<AgingBucketKey, "default" | "warn" | "ok"> = {
  current: "ok",
  days_31_60: "default",
  days_61_90: "warn",
  over_90: "warn",
}

export function ReceivableAgingPanel({
  ledger,
  asOfDate,
  buckets,
  total,
  openLineCount,
}: {
  ledger: "receivable" | "payable"
  asOfDate: string
  buckets: AgingBuckets
  total: number
  openLineCount: number
}) {
  const t = useT(useLang().lang)
  if (openLineCount === 0 || total <= 0) return null

  const title =
    ledger === "receivable" ? t("acct_aging_title_receivable") : t("acct_aging_title_payable")

  return (
    <div className="rounded-lg border border-border/70 bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {t("acct_aging_as_of")} {asOfDate.slice(0, 10)} · {t("acct_aging_line_count").replace("{n}", String(openLineCount))}
        </span>
      </div>
      <AccountingStatGrid className="grid-cols-2 md:grid-cols-4">
        {AGING_BUCKET_ORDER.map((key) => (
          <AccountingStatCard
            key={key}
            label={t(BUCKET_LABEL_KEY[key])}
            value={`฿${Math.round(buckets[key]).toLocaleString()}`}
            tone={BUCKET_TONE[key] === "warn" ? "warn" : BUCKET_TONE[key] === "ok" ? "ok" : "default"}
          />
        ))}
      </AccountingStatGrid>
      <MetricCard
        size="sm"
        variant="primary"
        label={t("acct_aging_total_open")}
        value={`฿${Math.round(total).toLocaleString()}`}
      />
    </div>
  )
}
