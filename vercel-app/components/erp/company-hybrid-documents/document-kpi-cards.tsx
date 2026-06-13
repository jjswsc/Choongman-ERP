"use client"

import { AlertTriangle, Clock, FileStack, Mail } from "lucide-react"
import type { CompanyHybridDocumentsSummary } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Props = {
  summary: CompanyHybridDocumentsSummary | null
  loading: boolean
  labels: {
    total: string
    expiringSoon: string
    expired: string
    corrOverdue: string
  }
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: typeof FileStack
  label: string
  value: number
  tone?: "warn" | "danger" | "muted"
  loading: boolean
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            tone === "danger" && "bg-destructive/10 text-destructive",
            tone === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-200",
            (!tone || tone === "muted") && "bg-primary/10 text-primary"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{loading ? "…" : value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function CompanyHybridDocumentKpiCards({ summary, loading, labels }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard icon={FileStack} label={labels.total} value={summary?.total ?? 0} loading={loading} />
      <KpiCard
        icon={Clock}
        label={labels.expiringSoon}
        value={summary?.expiring_soon ?? 0}
        tone={(summary?.expiring_soon ?? 0) > 0 ? "warn" : "muted"}
        loading={loading}
      />
      <KpiCard
        icon={AlertTriangle}
        label={labels.expired}
        value={summary?.expired ?? 0}
        tone={(summary?.expired ?? 0) > 0 ? "danger" : "muted"}
        loading={loading}
      />
      <KpiCard
        icon={Mail}
        label={labels.corrOverdue}
        value={summary?.corr_overdue ?? 0}
        tone={(summary?.corr_overdue ?? 0) > 0 ? "warn" : "muted"}
        loading={loading}
      />
    </div>
  )
}
