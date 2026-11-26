"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarPlus, Copy, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { appAlert } from "@/lib/app-message"
import {
  getStoreActionItems,
  getStoreActionPlanLinks,
  getStoreVisitCoverage,
  type StoreActionItem,
  type StoreActionPlanLink,
  type StoreVisitCoverage,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { useLang } from "@/lib/lang-context"
import { STORE_ACTION_HORIZONS, normalizeStoreActionHorizon } from "@/lib/store-action-items"
import { storeActionLabelers } from "@/lib/store-action-i18n"
import { useTranslatedTextMap } from "@/lib/use-ui-translate"
import { cn } from "@/lib/utils"
import { StoreActionVisitAddDialog } from "@/components/admin/store-action-visit-add-dialog"

type Group = { key: string; title: string; tone: string; rows: StoreActionItem[] }
type HorizonFilter = "all" | "day" | "week" | "month_30" | "month_cal"

/** 오늘 할 일 — 기한초과·재확인 대기·당일/주간/월간(horizon) + 방문 추천 매장 */
export function StoreActionTodayBoard(props: {
  t: (k: string) => string
  canVerify: boolean
  onOpen: (id: number) => void
  refreshKey?: number
}) {
  const { t, canVerify, onOpen, refreshKey } = props
  const { lang } = useLang()
  const [mineOnly, setMineOnly] = useState(true)
  const [horizonFilter, setHorizonFilter] = useState<HorizonFilter>("all")
  const [rows, setRows] = useState<StoreActionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [planLinks, setPlanLinks] = useState<Record<string, StoreActionPlanLink[]>>({})
  const [coverage, setCoverage] = useState<Map<string, StoreVisitCoverage>>(new Map())
  const [visitStore, setVisitStore] = useState<string | null>(null)
  const [coverageKey, setCoverageKey] = useState(0)
  const today = getBangkokTodayDateString()
  const label = storeActionLabelers(t)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getStoreActionItems({ openOnly: true, mine: mineOnly })
      setRows(list)
      setPlanLinks(await getStoreActionPlanLinks(list.map((r) => r.id)).catch(() => ({})))
    } catch {
      setRows([])
      setPlanLinks({})
    } finally {
      setLoading(false)
    }
  }, [mineOnly])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const scopedRows = useMemo(() => {
    if (horizonFilter === "all") return rows
    return rows.filter((r) => normalizeStoreActionHorizon(r.horizon) === horizonFilter)
  }, [rows, horizonFilter])

  const groups: Group[] = useMemo(() => {
    const overdue = scopedRows.filter((r) => r.overdue)
    const pending = scopedRows.filter((r) => !r.overdue && r.status === "pending_verify")
    const rest = scopedRows.filter((r) => !r.overdue && r.status !== "pending_verify")
    const day = rest.filter((r) => normalizeStoreActionHorizon(r.horizon) === "day")
    const week = rest.filter((r) => normalizeStoreActionHorizon(r.horizon) === "week")
    const month30 = rest.filter((r) => normalizeStoreActionHorizon(r.horizon) === "month_30")
    const monthCal = rest.filter((r) => normalizeStoreActionHorizon(r.horizon) === "month_cal")
    return [
      { key: "overdue", title: t("action_today_overdue"), tone: "border-red-500/50", rows: overdue },
      { key: "pending", title: t("action_today_pending"), tone: "border-amber-500/50", rows: pending },
      { key: "day", title: t("action_today_horizon_day"), tone: "border-blue-500/50", rows: day },
      { key: "week", title: t("action_today_horizon_week"), tone: "border-slate-400/50", rows: week },
      { key: "month_30", title: t("action_today_horizon_month_30"), tone: "border-violet-400/50", rows: month30 },
      { key: "month_cal", title: t("action_today_horizon_month_cal"), tone: "border-indigo-400/50", rows: monthCal },
    ]
  }, [scopedRows, t])

  const titlesToTranslate = useMemo(
    () =>
      [...new Set(rows.map((r) => String(r.title || "").trim()).filter(Boolean))],
    [rows]
  )
  const tr = useTranslatedTextMap(titlesToTranslate, lang, { force: true })

  const visitRank = useMemo(() => {
    const score = new Map<string, { overdue: number; pending: number; today: number }>()
    for (const r of rows) {
      const s = score.get(r.store) || { overdue: 0, pending: 0, today: 0 }
      if (r.overdue) s.overdue += 1
      else if (r.status === "pending_verify") s.pending += 1
      else if (r.dueDate === today) s.today += 1
      score.set(r.store, s)
    }
    return [...score.entries()]
      .map(([store, s]) => ({ store, ...s, w: s.overdue * 3 + s.pending * 2 + s.today }))
      .filter((x) => x.w > 0)
      .sort((a, b) => b.w - a.w)
      .slice(0, 8)
  }, [rows, today])

  const rankStoresKey = visitRank.map((v) => v.store).join("|")
  useEffect(() => {
    const stores = rankStoresKey ? rankStoresKey.split("|") : []
    if (stores.length === 0) return
    let alive = true
    void getStoreVisitCoverage(stores)
      .then((r) => {
        if (alive) setCoverage(new Map(r.list.map((c) => [c.store, c])))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [rankStoresKey, coverageKey])

  const nextPlanOf = (id: number) => {
    const ls = planLinks[String(id)] || []
    return ls.find((l) => l.date >= today && l.itemStatus !== "done") || null
  }

  const copyLine = async () => {
    const lines: string[] = [`${t("action_today_line_head")} (${today})`, ""]
    for (const g of groups) {
      if (g.rows.length === 0) continue
      lines.push(`${g.title} ${g.rows.length}`)
      for (const r of g.rows.slice(0, 15)) {
        lines.push(`- ${r.store} · ${r.title} · ${r.ownerName} (${r.dueDate || "-"})`)
      }
      lines.push("")
    }
    if (lines.length <= 2) lines.push(t("action_today_none"))
    lines.push(t("action_today_line_tail"))
    const text = lines.join("\n").trim()
    try {
      await navigator.clipboard.writeText(text)
      await appAlert(t("action_today_copied"))
    } catch {
      await appAlert(text)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canVerify ? (
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              className={cn("rounded px-2 py-1", mineOnly && "bg-primary text-primary-foreground")}
              onClick={() => setMineOnly(true)}
            >
              {t("action_today_mine")}
            </button>
            <button
              type="button"
              className={cn("rounded px-2 py-1", !mineOnly && "bg-primary text-primary-foreground")}
              onClick={() => setMineOnly(false)}
            >
              {t("action_today_all")}
            </button>
          </div>
        ) : null}
        <div className="inline-flex flex-wrap rounded-md border p-0.5 text-xs">
          <button
            type="button"
            className={cn("rounded px-2 py-1", horizonFilter === "all" && "bg-primary text-primary-foreground")}
            onClick={() => setHorizonFilter("all")}
          >
            {t("action_filter_all")}
          </button>
          {STORE_ACTION_HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              className={cn("rounded px-2 py-1", horizonFilter === h && "bg-primary text-primary-foreground")}
              onClick={() => setHorizonFilter(h)}
            >
              {label.horizon(h)}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          {t("btn_query_go")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void copyLine()}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          {t("action_today_copy_line")}
        </Button>
      </div>

      {visitRank.length > 0 ? (
        <Card>
          <CardContent className="p-3">
            <p className="mb-1 text-xs font-semibold">{t("action_today_visit_rank")}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {visitRank.map((v) => {
                const c = coverage.get(v.store)
                const gap = v.overdue > 0 && !!c && !c.plannedSoon
                return (
                  <div
                    key={v.store}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px]",
                      gap && "border-red-500/60 bg-red-50 dark:bg-red-950/20"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {v.store}
                        {v.overdue ? <span className="ml-1 text-red-600">●{v.overdue}</span> : null}
                        {v.pending ? <span className="ml-1 text-amber-600">●{v.pending}</span> : null}
                        {v.today ? <span className="ml-1 text-blue-600">●{v.today}</span> : null}
                      </p>
                      {c ? (
                        <p className="truncate text-muted-foreground">
                          {t("dp_cov_last")}: {c.lastVisitDate ? `${c.lastVisitDate} ${c.lastVisitBy}` : "—"}
                          {" · "}
                          {t("dp_cov_next")}: {c.nextPlanDate ? `${c.nextPlanDate} ${c.nextPlanBy}` : "—"}
                        </p>
                      ) : null}
                      {gap ? <p className="font-semibold text-red-600">{t("dp_cov_gap_warn")}</p> : null}
                    </div>
                    {canVerify ? (
                      <Button
                        size="sm"
                        variant={gap ? "default" : "outline"}
                        className="h-7 shrink-0 px-2 text-[11px]"
                        onClick={() => setVisitStore(v.store)}
                      >
                        <CalendarPlus className="mr-1 h-3 w-3" />
                        {t("dp_visit_add_short")}
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.key} className={cn("border-l-4", g.tone)}>
            <CardContent className="space-y-1.5 p-3">
              <p className="text-xs font-semibold">
                {g.title} <span className="tabular-nums text-muted-foreground">{loading ? "—" : g.rows.length}</span>
              </p>
              {g.rows.length === 0 && !loading ? (
                <p className="text-[11px] text-muted-foreground">-</p>
              ) : (
                g.rows.slice(0, 30).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="block w-full rounded border px-2 py-1.5 text-left text-[11px] hover:bg-muted/40"
                    onClick={() => onOpen(r.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{tr(r.title) || r.title}</span>
                      <span className={cn("tabular-nums", r.overdue && "font-semibold text-red-600")}>
                        {r.dueDate || "—"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {r.store} · {r.ownerName} · {label.status(r.status)}
                      {r.repeatCount > 0 ? ` · ${t("action_repeat_n").replace("{n}", String(r.repeatCount))}` : ""}
                    </div>
                    {(() => {
                      const p = nextPlanOf(r.id)
                      return p ? (
                        <div className="mt-0.5 text-blue-700 dark:text-blue-300">
                          📅 {p.date === today ? t("dp_today") : p.date} · {p.employeeName}
                        </div>
                      ) : null
                    })()}
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <StoreActionVisitAddDialog
        store={visitStore}
        t={t}
        onClose={() => setVisitStore(null)}
        onAdded={() => setCoverageKey((k) => k + 1)}
      />
    </div>
  )
}
