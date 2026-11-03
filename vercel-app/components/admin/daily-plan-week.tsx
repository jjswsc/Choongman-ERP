"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckSquare, ChevronLeft, ChevronRight, Plus, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import {
  ensurePublishDailyPlanTargets,
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

function cellKey(employeeId: number, date: string): string {
  return `${employeeId}|${date}`
}

function parseCellKey(key: string): { employeeId: number; date: string } | null {
  const i = key.indexOf("|")
  if (i < 0) return null
  const employeeId = Math.floor(Number(key.slice(0, i)) || 0)
  const date = key.slice(i + 1)
  if (!(employeeId > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { employeeId, date }
}

type RowPerson = { id: number; name: string; store: string; role: string; days: (DailyPlanWeekCell | null)[] }

/** 주간 일정 — 빈 칸·미공개 다중 선택(드래그·Shift)·일괄 생성+공개 */
export function DailyPlanWeek({ t, onAssign }: { t: T; onAssign: (date: string, employeeId: number) => void }) {
  const label = dailyPlanLabelers(t)
  const today = getBangkokTodayDateString()
  const [start, setStart] = useState(today)
  const [role, setRole] = useState("supervisor")
  const [cells, setCells] = useState<DailyPlanWeekCell[]>([])
  const [candidates, setCandidates] = useState<DailyPlanCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const anchorRef = useRef<string | null>(null)
  const dragRef = useRef<{ active: boolean; mode: "add" | "remove" }>({ active: false, mode: "add" })

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addBangkokCalendarDays(start, i)), [start])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [week, board] = await Promise.all([getDailyPlanWeek(start), getDailyPlanBoard(today, { candidates: true })])
      setCells(Array.isArray(week.list) ? week.list : [])
      setNotReady(!!week.notReady)
      setCandidates(Array.isArray(board.candidates) ? board.candidates : [])
      setSelected(new Set())
      anchorRef.current = null
    } finally {
      setLoading(false)
    }
  }, [start, today])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const end = () => {
      dragRef.current.active = false
    }
    window.addEventListener("pointerup", end)
    window.addEventListener("pointercancel", end)
    return () => {
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
    }
  }, [])

  const rows: RowPerson[] = useMemo(() => {
    const people = new Map<number, { id: number; name: string; store: string; role: string }>()
    for (const c of candidates) {
      if (c.planRole === role && role !== "staff") people.set(c.id, { id: c.id, name: c.name, store: c.store, role: c.planRole })
    }
    for (const c of cells) {
      if (c.role === role && !people.has(c.employeeId)) {
        people.set(c.employeeId, { id: c.employeeId, name: c.employeeName, store: c.employeeStore, role: c.role })
      }
    }
    const byKey = new Map(cells.map((c) => [cellKey(c.employeeId, c.date), c]))
    return [...people.values()]
      .sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name))
      .map((p) => ({ ...p, days: days.map((d) => byKey.get(cellKey(p.id, d)) || null) }))
  }, [candidates, cells, days, role])

  /** 선택 가능: 오늘 이후 + (빈 칸 또는 미공개·미마감) */
  const selectableKeys = useMemo(() => {
    const keys: string[] = []
    for (const r of rows) {
      for (let i = 0; i < days.length; i++) {
        const d = days[i]
        if (d < today) continue
        const c = r.days[i]
        if (!c) {
          keys.push(cellKey(r.id, d))
          continue
        }
        if (!c.published && c.status !== "closed") keys.push(cellKey(r.id, d))
      }
    }
    return keys
  }, [rows, days, today])

  const selectableSet = useMemo(() => new Set(selectableKeys), [selectableKeys])

  const flatIndex = useMemo(() => {
    const m = new Map<string, number>()
    selectableKeys.forEach((k, i) => m.set(k, i))
    return m
  }, [selectableKeys])

  const applyKeys = useCallback((keys: string[], mode: "add" | "remove" | "toggle" | "set") => {
    const usable = keys.filter((k) => selectableSet.has(k))
    setSelected((prev) => {
      if (mode === "set") return new Set(usable)
      const next = new Set(prev)
      for (const k of usable) {
        if (mode === "add") next.add(k)
        else if (mode === "remove") next.delete(k)
        else if (next.has(k)) next.delete(k)
        else next.add(k)
      }
      return next
    })
  }, [selectableSet])

  const rangeKeys = useCallback(
    (a: string, b: string): string[] => {
      const ia = flatIndex.get(a)
      const ib = flatIndex.get(b)
      if (ia == null || ib == null) return [b]
      const lo = Math.min(ia, ib)
      const hi = Math.max(ia, ib)
      return selectableKeys.slice(lo, hi + 1)
    },
    [flatIndex, selectableKeys]
  )

  const onCellPointerDown = (key: string, e: React.PointerEvent) => {
    if (!selectableSet.has(key)) return
    e.preventDefault()
    if (e.shiftKey && anchorRef.current) {
      applyKeys(rangeKeys(anchorRef.current, key), "set")
      return
    }
    const removing = selected.has(key)
    dragRef.current = { active: true, mode: removing ? "remove" : "add" }
    anchorRef.current = key
    applyKeys([key], removing ? "remove" : "add")
  }

  const onCellPointerEnter = (key: string) => {
    if (!dragRef.current.active || !selectableSet.has(key)) return
    applyKeys([key], dragRef.current.mode)
  }

  const toggleDay = (date: string) => {
    if (date < today) return
    const dayKeys = selectableKeys.filter((k) => k.endsWith(`|${date}`))
    if (dayKeys.length === 0) return
    const allOn = dayKeys.every((k) => selected.has(k))
    applyKeys(dayKeys, allOn ? "remove" : "add")
  }

  const selectAllPublishable = () => applyKeys(selectableKeys, "set")
  const clearSelection = () => {
    setSelected(new Set())
    anchorRef.current = null
  }

  const publishSelected = async () => {
    const targets = [...selected].map(parseCellKey).filter((x): x is { employeeId: number; date: string } => !!x)
    if (targets.length === 0) {
      await appAlert(t("dp_week_publish_pick"))
      return
    }
    setPublishing(true)
    try {
      const res = await ensurePublishDailyPlanTargets(targets, { publish: true })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      await appAlert(
        t("dp_week_ensure_publish_done")
          .replace("{created}", String(res.created ?? 0))
          .replace("{published}", String(res.published ?? 0))
          .replace("{skipped}", String(res.skipped ?? 0))
          .replace("{failed}", String(res.failed ?? 0))
      )
      await load()
    } finally {
      setPublishing(false)
    }
  }

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
              onClick={() => {
                setRole(r)
                setSelected(new Set())
                anchorRef.current = null
              }}
            >
              {label.role(r)}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={selectAllPublishable} disabled={selectableKeys.length === 0}>
          <CheckSquare className="mr-1 h-3.5 w-3.5" />
          {t("dp_week_select_all")}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearSelection} disabled={selected.size === 0}>
          {t("dp_week_clear_sel")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("dp_week_selected_n").replace("{n}", String(selected.size))}
        </span>
        <Button
          size="sm"
          className="ml-auto h-8 text-xs"
          disabled={selected.size === 0 || publishing}
          onClick={() => void publishSelected()}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          {publishing ? t("loading") : t("dp_week_create_publish_sel")}
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
              <table className="w-full min-w-[900px] table-fixed select-none text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-32 p-1.5">{t("dp_col_person")}</th>
                    {days.map((d) => {
                      const dayKeys = selectableKeys.filter((k) => k.endsWith(`|${d}`))
                      const allOn = dayKeys.length > 0 && dayKeys.every((k) => selected.has(k))
                      return (
                        <th key={d} className={cn("p-1.5", d === today && "text-primary")}>
                          <div className="flex items-center gap-1">
                            {dayKeys.length > 0 ? (
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={allOn}
                                onChange={() => toggleDay(d)}
                                title={t("dp_week_day_select")}
                                aria-label={t("dp_week_day_select")}
                              />
                            ) : null}
                            <span>
                              {d.slice(5)} ({t(weekdayKey(d))})
                            </span>
                          </div>
                        </th>
                      )
                    })}
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
                        const key = cellKey(r.id, d)
                        const canSelect = selectableSet.has(key)
                        const isSel = selected.has(key)

                        if (!c) {
                          return (
                            <td
                              key={d}
                              className="p-1"
                              onPointerDown={(e) => canSelect && onCellPointerDown(key, e)}
                              onPointerEnter={() => canSelect && onCellPointerEnter(key)}
                            >
                              {!past ? (
                                <div
                                  className={cn(
                                    "relative flex min-h-[44px] w-full items-center justify-center rounded border border-dashed",
                                    isSel && "border-solid border-primary bg-primary/10 ring-2 ring-primary/40",
                                    canSelect && "cursor-pointer hover:bg-muted/50"
                                  )}
                                >
                                  {canSelect ? (
                                    <input
                                      type="checkbox"
                                      className="absolute right-1 top-1 h-3.5 w-3.5"
                                      checked={isSel}
                                      readOnly
                                      tabIndex={-1}
                                    />
                                  ) : null}
                                  <button
                                    type="button"
                                    title={t("dp_week_dbl_open")}
                                    className="flex h-full w-full items-center justify-center text-muted-foreground"
                                    onDoubleClick={(e) => {
                                      e.stopPropagation()
                                      onAssign(d, r.id)
                                    }}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          )
                        }

                        const rate = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0
                        return (
                          <td
                            key={d}
                            className="p-1"
                            onPointerDown={(e) => canSelect && onCellPointerDown(key, e)}
                            onPointerEnter={() => canSelect && onCellPointerEnter(key)}
                          >
                            <div
                              className={cn(
                                "relative w-full rounded border p-1.5 text-left",
                                c.status === "closed" && "bg-muted/60",
                                !c.published && c.status !== "closed" && "border-amber-400",
                                isSel && "ring-2 ring-primary/40"
                              )}
                            >
                              {canSelect ? (
                                <input
                                  type="checkbox"
                                  className="absolute right-1 top-1 z-10 h-3.5 w-3.5 rounded bg-background/90"
                                  checked={isSel}
                                  readOnly
                                  tabIndex={-1}
                                />
                              ) : null}
                              <button
                                type="button"
                                title={t("dp_week_dbl_open")}
                                onDoubleClick={(e) => {
                                  e.stopPropagation()
                                  onAssign(d, r.id)
                                }}
                                className="w-full text-left hover:opacity-90"
                              >
                                <p className="line-clamp-3 pr-5 text-[11px] font-medium">
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
                            </div>
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
            <div className="flex flex-wrap gap-2">
              {storeLoad.map(([store, n]) => (
                <span key={store} className="rounded bg-muted px-2 py-0.5 text-[11px]">
                  {store}: {n}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
