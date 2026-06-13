"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type TierRow = {
  code: string
  name: string
  min_amount: number
  min_points: number
  point_rate: number
  sort_order: number
}

export function CrmTierLadder({ rows, upgradeBasis }: { rows: TierRow[]; upgradeBasis: "amount" | "points" }) {
  const { lang } = useLang()
  const t = useT(lang)
  const sorted = React.useMemo(
    () => [...rows].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [rows]
  )
  if (!sorted.length) return null
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-semibold">{t("crmPointsTierLadder")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("crmPointsTierLadderHint")}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {sorted.map((tier, idx) => (
          <div
            key={tier.code}
            className={cn(
              "relative flex-1 rounded-lg border bg-card p-3 text-sm shadow-sm",
              idx === sorted.length - 1 && "ring-1 ring-primary/30"
            )}
          >
            <p className="font-semibold">{tier.name || tier.code}</p>
            <p className="text-xs text-muted-foreground">{tier.code}</p>
            <p className="mt-2 text-xs">
              {upgradeBasis === "amount"
                ? `${t("memberTierMinAmount")}: ${Number(tier.min_amount || 0).toLocaleString()}`
                : `${t("memberTierMinPoints")}: ${Number(tier.min_points || 0).toLocaleString()}`}
            </p>
            <p className="text-xs tabular-nums">
              {t("memberTierPointRate")}: {(Number(tier.point_rate || 0) * 100).toFixed(2)}%
            </p>
            {idx < sorted.length - 1 ? (
              <span className="absolute -right-2 top-1/2 hidden h-0 w-0 -translate-y-1/2 border-y-8 border-l-8 border-y-transparent border-l-border sm:block" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
