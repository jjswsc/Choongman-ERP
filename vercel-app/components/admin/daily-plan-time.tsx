"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { cn } from "@/lib/utils"
import { applyRoutineEstimate, getDailyPlanTimeSummary, type DailyPlanTimeRow } from "@/lib/api-client"
import { appAlert, appConfirm } from "@/lib/app-message"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { dailyPlanLabelers, minutesLabel } from "@/lib/daily-plan-i18n"

type T = (k: string) => string

/** 평균 실제가 예상보다 30% 이상 길거나 짧으면 템플릿 조정 후보 */
const DRIFT_RATIO = 0.3

export function DailyPlanTime({ t }: { t: T }) {
  const label = dailyPlanLabelers(t)
  const today = getBangkokTodayDateString()
  const [start, setStart] = useState(() => addBangkokCalendarDays(today, -13))
  const [end, setEnd] = useState(today)
  const [role, setRole] = useState("all")
  const [rows, setRows] = useState<DailyPlanTimeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDailyPlanTimeSummary(start, end)
      setRows(Array.isArray(res.list) ? res.list : [])
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => rows.filter((r) => role === "all" || r.roleScope === role), [rows, role])

  const totals = useMemo(() => {
    const count = filtered.reduce((s, r) => s + r.count, 0)
    const done = filtered.reduce((s, r) => s + r.done, 0)
    const skipped = filtered.reduce((s, r) => s + r.skipped, 0)
    return {
      count,
      doneRate: count > 0 ? Math.round((done / count) * 100) : 0,
      skipRate: count > 0 ? Math.round((skipped / count) * 100) : 0,
      actual: filtered.reduce((s, r) => s + r.actualSum, 0),
    }
  }, [filtered])

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of filtered) m.set(r.category, (m.get(r.category) || 0) + r.actualSum)
    const sum = [...m.values()].reduce((s, v) => s + v, 0)
    return [...m.entries()]
      .map(([category, minutes]) => ({ category, minutes, pct: sum > 0 ? Math.round((minutes / sum) * 100) : 0 }))
      .sort((a, b) => b.minutes - a.minutes)
  }, [filtered])

  const drift = (r: DailyPlanTimeRow): "over" | "under" | null => {
    if (r.done < 3 || r.avgEst <= 0) return null
    if (r.avgActual > r.avgEst * (1 + DRIFT_RATIO)) return "over"
    if (r.avgActual < r.avgEst * (1 - DRIFT_RATIO)) return "under"
    return null
  }

  const applyEstimate = async (r: DailyPlanTimeRow) => {
    const minutes = Math.max(1, Math.round(r.avgActual))
    const ok = await appConfirm(
      t("dp_apply_estimate_confirm")
        .replace("{title}", r.title)
        .replace("{from}", String(r.avgEst))
        .replace("{to}", String(minutes))
    )
    if (!ok) return
    const key = `${r.roleScope}|${r.title}`
    setApplying(key)
    try {
      const res = await applyRoutineEstimate({ roleScope: r.roleScope, title: r.title, estMinutes: minutes })
      if (!res.success) {
        await appAlert(res.message || t("dp_save_fail"))
        return
      }
      await appAlert(
        (res.updated || 0) > 0
          ? t("dp_apply_estimate_done").replace("{n}", String(res.updated || 0))
          : t("dp_apply_estimate_none")
      )
    } finally {
      setApplying(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40" />
        <span className="text-xs">~</span>
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-40" />
        <div className="flex gap-1">
          {["all", "supervisor", "manager", "staff"].map((r) => (
            <Button
              key={r}
              size="sm"
              variant={role === r ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setRole(r)}
            >
              {r === "all" ? t("dp_all") : label.role(r)}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("dp_time_items"), value: String(totals.count) },
          { label: t("dp_kpi_rate"), value: `${totals.doneRate}%` },
          { label: t("dp_time_skip_rate"), value: `${totals.skipRate}%` },
          { label: t("dp_time_actual_total"), value: minutesLabel(totals.actual, t) },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-bold tabular-nums">{loading ? "—" : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {byCategory.length > 0 ? (
        <Card>
          <CardContent className="space-y-1.5 p-3">
            <p className="text-xs font-semibold">{t("dp_time_by_category")}</p>
            {byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0">{label.category(c.category)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-blue-500" style={{ width: `${c.pct}%` }} />
                </div>
                <span className="w-28 shrink-0 text-right tabular-nums">
                  {minutesLabel(c.minutes, t)} ({c.pct}%)
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-2">
          <p className="p-1 text-[11px] text-muted-foreground">{t("dp_time_hint")}</p>
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{loading ? t("loading") : t("dp_time_empty")}</p>
          ) : (
            <AdminTableScroll>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-1.5">{t("dp_col_role")}</th>
                    <th className="p-1.5">{t("dp_col_category")}</th>
                    <th className="p-1.5">{t("dp_col_title")}</th>
                    <th className="p-1.5 text-right">{t("dp_col_count")}</th>
                    <th className="p-1.5 text-right">{t("dp_item_done")}</th>
                    <th className="p-1.5 text-right">{t("dp_item_skipped")}</th>
                    <th className="p-1.5 text-right">{t("dp_col_avg_est")}</th>
                    <th className="p-1.5 text-right">{t("dp_col_avg_actual")}</th>
                    <th className="p-1.5 text-right">{t("dp_col_total_actual")}</th>
                    <th className="p-1.5">{t("dp_col_suggest")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const d = drift(r)
                    return (
                      <tr key={`${r.roleScope}|${r.category}|${r.title}`} className="border-b">
                        <td className="p-1.5">{label.role(r.roleScope)}</td>
                        <td className="p-1.5">{label.category(r.category)}</td>
                        <td className="max-w-[260px] truncate p-1.5" title={r.title}>
                          {r.title}
                        </td>
                        <td className="p-1.5 text-right tabular-nums">{r.count}</td>
                        <td className="p-1.5 text-right tabular-nums">{r.done}</td>
                        <td className={cn("p-1.5 text-right tabular-nums", r.skipped > 0 && "text-amber-600")}>
                          {r.skipped}
                        </td>
                        <td className="p-1.5 text-right tabular-nums">{r.avgEst}</td>
                        <td
                          className={cn(
                            "p-1.5 text-right tabular-nums",
                            d === "over" && "font-semibold text-red-600",
                            d === "under" && "text-emerald-600"
                          )}
                        >
                          {r.avgActual}
                        </td>
                        <td className="p-1.5 text-right tabular-nums">{minutesLabel(r.actualSum, t)}</td>
                        <td className="p-1.5 text-[11px]">
                          {d ? (
                            <div className="flex items-center gap-1">
                              <span>
                                {t(d === "over" ? "dp_suggest_more" : "dp_suggest_less").replace(
                                  "{n}",
                                  String(r.avgActual)
                                )}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                disabled={applying != null}
                                onClick={() => void applyEstimate(r)}
                              >
                                {t("dp_apply_estimate")}
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </AdminTableScroll>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
