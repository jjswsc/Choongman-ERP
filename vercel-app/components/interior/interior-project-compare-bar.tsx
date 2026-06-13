"use client"

import * as React from "react"
import Link from "next/link"
import { AlertTriangle, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getInteriorDashboardSummary,
  getInteriorProjects,
  type InteriorProject,
  type InteriorProjectDashboardRow,
} from "@/lib/api-client"
import { downloadInteriorCsv } from "@/lib/interior-csv-export"
import { INTERIOR_ADMIN, withInteriorProjectId } from "@/lib/interior-admin-nav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type InteriorProjectCompareBarProps = {
  projectIds: string[]
}

export function InteriorProjectCompareBar({ projectIds }: InteriorProjectCompareBarProps) {
  const t = useT(useLang().lang)
  const [projects, setProjects] = React.useState<InteriorProject[]>([])
  const [summaries, setSummaries] = React.useState<Map<number, InteriorProjectDashboardRow>>(new Map())

  React.useEffect(() => {
    getInteriorProjects()
      .then((r) => setProjects(r || []))
      .catch(() => setProjects([]))
    getInteriorDashboardSummary()
      .then((s) => {
        const map = new Map<number, InteriorProjectDashboardRow>()
        for (const row of s?.projects ?? []) {
          if (row.id) map.set(row.id, row)
        }
        setSummaries(map)
      })
      .catch(() => setSummaries(new Map()))
  }, [projectIds.join(",")])

  if (projectIds.length < 2) return null

  const rows = projectIds
    .map((id) => {
      const p = projects.find((row) => String(row.id) === id)
      const meta = summaries.get(Number(id))
      return p ? { project: p, meta } : null
    })
    .filter(Boolean) as { project: InteriorProject; meta?: InteriorProjectDashboardRow }[]

  if (!rows.length) return null

  const exportCsv = () => {
    downloadInteriorCsv(
      `interior-compare-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        t("interiorProjectCode"),
        t("interiorProjectName"),
        t("interiorBudget"),
        t("interiorBudgetSpent"),
        t("interiorBudgetUsage"),
        t("interiorAlertSchedule"),
        t("interiorAlertVendor"),
        t("interiorAlertBudget"),
      ],
      rows.map(({ project: p, meta }) => {
        const budget = p.budgetTotal ?? 0
        const spent = meta?.paidTotal ?? 0
        const pct = budget > 0 ? `${Math.round((spent / budget) * 100)}%` : ""
        return [
          p.code || "",
          p.name || "",
          budget > 0 ? String(budget) : "",
          String(spent),
          pct,
          String(meta?.scheduleLateCount ?? 0),
          String(meta?.vendorDelayedCount ?? 0),
          meta?.overBudget ? "Y" : "",
        ]
      })
    )
  }

  return (
    <div className="mx-auto mb-4 max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t("interiorCompareTitle")}
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            {t("interiorCompareExportCsv")}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium">{t("interiorProjectCode")}</th>
                <th className="px-2 py-1.5 text-left font-medium">{t("interiorProjectName")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("interiorBudgetUsage")}</th>
                <th className="px-2 py-1.5 text-center font-medium">{t("interiorAlertSchedule")}</th>
                <th className="px-2 py-1.5 text-center font-medium">{t("interiorAlertVendor")}</th>
                <th className="px-2 py-1.5 text-center font-medium">{t("interiorAlertBudget")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ project: p, meta }) => {
                const budget = p.budgetTotal ?? 0
                const spent = meta?.paidTotal ?? 0
                const pct = budget > 0 ? Math.round((spent / budget) * 100) : null
                return (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-2 font-mono">
                      <Link
                        href={withInteriorProjectId(INTERIOR_ADMIN.schedule, p.id!)}
                        className="text-primary hover:underline"
                      >
                        {p.code}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{p.name}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {budget > 0 ? (
                        <span className={cn(meta?.overBudget && "text-destructive")}>
                          {pct}% · ฿{spent.toLocaleString()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {(meta?.scheduleLateCount ?? 0) > 0 ? meta?.scheduleLateCount : "—"}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {(meta?.vendorDelayedCount ?? 0) > 0 ? meta?.vendorDelayedCount : "—"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {meta?.overBudget ? (
                        <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                          {t("interiorAlertBudget")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
