"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type RfmRow = {
  memberId: number
  rScore: number
  fScore: number
  mScore: number
  rfmScore: string
}

function bucketKey(r: number, f: number): string {
  const rr = Math.max(1, Math.min(5, Math.round(r)))
  const ff = Math.max(1, Math.min(5, Math.round(f)))
  return `${rr}${ff}`
}

export function CrmRfmMatrix({ rows }: { rows: RfmRow[] }) {
  const { lang } = useLang()
  const t = useT(lang)
  const grid = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const row of rows) {
      const key = bucketKey(row.rScore, row.fScore)
      m.set(key, (m.get(key) || 0) + 1)
    }
    return m
  }, [rows])
  const max = Math.max(1, ...Array.from(grid.values()))
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{t("crmVisitsRfmMatrix")}</p>
      <div className="inline-grid grid-cols-5 gap-1">
        {[5, 4, 3, 2, 1].map((r) =>
          [1, 2, 3, 4, 5].map((f) => {
            const count = grid.get(`${r}${f}`) || 0
            const intensity = count / max
            return (
              <div
                key={`${r}-${f}`}
                title={`R${r} F${f}: ${count}`}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded text-[10px] font-semibold tabular-nums sm:h-12 sm:w-12",
                  count === 0 ? "bg-muted/40 text-muted-foreground" : "text-slate-900"
                )}
                style={
                  count > 0
                    ? { backgroundColor: `rgba(79, 70, 229, ${0.15 + intensity * 0.65})` }
                    : undefined
                }
              >
                {count || "·"}
              </div>
            )
          })
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">R ↓ / F →</p>
    </div>
  )
}
