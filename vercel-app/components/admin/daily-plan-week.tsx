"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { cn } from "@/lib/utils"
import {
  getDailyPlanBoard,
  getDailyPlanWeek,
  type DailyPlanCandidate,
  type DailyPlanWeekCell,
} from "@/lib/api-client"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { dailyPlanLabelers } from "@/lib/daily-plan-i18n"

type T = (k: string) => string

const WD_KEYS = ["dp_wd_7", "dp_wd_1", "dp_wd_2", "dp_wd_3", "dp_wd_4", "dp_wd_5", "dp_wd_6"]

function weekdayKey(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay()
  return WD_KEYS[d]
}

/** 주간 일정 — 사람 × 7일. 칸을 누르면 그 날짜·사람 배정 화면으로 */
export function DailyPlanWeek({ t, onAssign }: { t: T; onAssign: (date: string, employeeId: number) => void }) {
  const label = dailyPlanLabelers(t)
  const today = getBangkokTodayDateString()
  const [start, setStart] = useState(today)
  const [role, setRole] = useState("supervisor")
  const [cells, setCells] = useState<DailyPlanWeekCell[]>([])
  const [candidates, setCandidates] = useState<DailyPlanCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [notReady, setNotReady] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addBangkokCalendarDays(start, i)), [start])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [week, board] = await Promise.all([getDailyPlanWeek(start), getDailyPlanBoard(today, { candidates: true })])
      setCells(Array.isArray(week.list) ? week.list : [])
      setNotReady(!!week.notReady)
      setCandidates(Array.isArray(board.candidates) ? board.candidates : [])
    } finally {
      setLoading(false)
    }
  }, [start, today])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    const people = new Map<number, { id: number; name: string; store: string; role: string }>()
    for (const c of candidates) {
      if (c.planRole === role && role !== "staff") people.set(c.id, { id: c.id, name: c.name, store: c.store, role: c.planRole })
    }
    for (const c of cells) {
      if (c.role === role && !people.has(c.employeeId)) {
        people.set(c.employeeId, { id: c.employeeId, name: c.employeeName, store: c.employeeStore, role: c.role })
      }
    }
    const byKey = new Map(cells.map((c) => [`${c.employeeId}|${c.date}`, c]))
    return [...people.values()]
      .sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name))
      .map((p) => ({ ...p, days: days.map((d) => byKey.get(`${p.id}|${d}`) || null) }))
  }, [candidates, cells, days, role])

  const storeLoad = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cells) {
      if (c.role !== "supervisor") continue
      for (const s of c.route) m.set(s, (m.get(s) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [cells])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setStart((s) => addBangkokCalendarDays(s, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">
          {days[0]} ~ {days[6]}
        </span>
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setStart((s) => addBangkokCalendarDays(s, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setStart(today)}>
          {t("dp_week_today")}
        </Button>
        <div className="flex gap-1">
          {["supervisor", "manager", "staff"].map((r) => (
            <Button
              key={r}
              size="sm"
              variant={role === r ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setRole(r)}
            >
              {label.role(r)}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("dp_week_hint")}</p>
      {notReady ? <p className="text-sm text-amber-600">{t("dp_not_ready")}</p> : null}

      <Card>
        <CardContent className="p-2">
          {rows.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">{loading ? t("loading") : t("dp_empty_board")}</p>
          ) : (
            <AdminTableScroll>
              <table className="w-full min-w-[900px] table-fixed text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-32 p-1.5">{t("dp_col_person")}</th>
                    {days.map((d) => (
                      <th key={d} className={cn("p-1.5", d === today && "text-primary")}>
                        {d.slice(5)} ({t(weekdayKey(d))})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b align-top">
                      <td className="p-1.5">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground">{r.store}</p>
                      </td>
                      {r.days.map((c, i) => {
                        const d = days[i]
                        const past = d < today
                        if (!c) {
                          return (
                            <td key={d} className="p-1">
                              {!past ? (
                                <button
                                  type="button"
                                  onClick={() => onAssign(d, r.id)}
                                  className="flex h-full min-h-[44px] w-full items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-muted/50"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </td>
                          )
                        }
                        const rate = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
                        return (
                          <td key={d} className="p-1">
                            <button
                              type="button"
                              onClick={() => onAssign(d, r.id)}
                              className={cn(
                                "w-full rounded border p-1.5 text-left hover:bg-muted/50",
                                c.status === "closed" && "bg-muted/60",
                                !c.published && c.status !== "closed" && "border-amber-400"
                              )}
                            >
                              <p className="line-clamp-3 text-[11px] font-medium">
                                {c.route.length > 0 ? c.route.join(" → ") : c.store}
                              </p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                                {c.done}/{c.total} ({rate}%)
                                {c.shiftIn ? ` · ${c.shiftIn}` : ""}
                              </p>
                              <p className="text-[10px]">
                                {c.status === "closed"
                                  ? label.planStatus("closed")
                                  : c.published
                                    ? t("dp_published")
                                    : t("dp_unpublished")}
                              </p>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableScroll>
          )}
        </CardContent>
      </Card>

      {role === "supervisor" && storeLoad.length > 0 ? (
        <Card>
          <CardContent className="space-y-1 p-3">
            <p className="text-xs font-semibold">{t("dp_week_store_visits")}</p>
            <div className="flex flex-wrap gap-1.5">
              {storeLoad.map(([s, n]) => (
                <span key={s} className="rounded border px-2 py-0.5 text-[11px]">
                  {s} <span className="tabular-nums text-muted-foreground">×{n}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
