"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, Lightbulb, Plus, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import {
  generateDailyPlans,
  getDailyPlanBoard,
  getVisitSuggestions,
  saveDailyPlanAssignment,
  useStoreList,
  type DailyPlanBoardRow,
  type DailyPlanCandidate,
  type VisitSuggestionDto,
} from "@/lib/api-client"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { dailyPlanLabelers, minutesLabel } from "@/lib/daily-plan-i18n"

type T = (k: string) => string
type TaskDraft = { title: string; store: string; estMinutes: number }

/** 주간 보기에서 넘어올 때 날짜·사람 미리 선택 */
export type DailyPlanAssignPreset = { date: string; employeeId: number; nonce: number }

const ROLE_ORDER = ["supervisor", "manager", "staff"]

export function DailyPlanAssign({ t, preset }: { t: T; preset?: DailyPlanAssignPreset | null }) {
  const label = dailyPlanLabelers(t)
  const { stores: storeList } = useStoreList()
  const [date, setDate] = useState(() => preset?.date || addBangkokCalendarDays(getBangkokTodayDateString(), 1))
  const [loadedDate, setLoadedDate] = useState("")
  const [pendingSelect, setPendingSelect] = useState<number | null>(preset?.employeeId ?? null)
  const [suggest, setSuggest] = useState<VisitSuggestionDto[] | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [plans, setPlans] = useState<DailyPlanBoardRow[]>([])
  const [candidates, setCandidates] = useState<DailyPlanCandidate[]>([])
  const [canAssignAll, setCanAssignAll] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [routeStores, setRouteStores] = useState<string[]>([])
  const [tasks, setTasks] = useState<TaskDraft[]>([])
  const [briefing, setBriefing] = useState("")
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDailyPlanBoard(date, { candidates: true })
      setPlans(Array.isArray(res.plans) ? res.plans : [])
      setCandidates(Array.isArray(res.candidates) ? res.candidates : [])
      setCanAssignAll(!!res.canAssignAll)
      setLoadedDate(date)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!preset) return
    setDate(preset.date)
    setPendingSelect(preset.employeeId)
  }, [preset])

  const planByEmp = useMemo(() => new Map(plans.map((p) => [p.employee_id, p])), [plans])

  const people = useMemo(() => {
    const map = new Map<number, DailyPlanCandidate>()
    for (const c of candidates) map.set(c.id, c)
    for (const p of plans) {
      if (!map.has(p.employee_id)) {
        map.set(p.employee_id, {
          id: p.employee_id,
          name: p.employee_name,
          nick: "",
          store: p.employee_store,
          job: "",
          planRole: p.role_scope,
        })
      }
    }
    const needle = q.trim().toLowerCase()
    return [...map.values()]
      .filter((c) => !needle || `${c.name} ${c.nick} ${c.store}`.toLowerCase().includes(needle))
      .filter((c) => c.planRole !== "staff" || planByEmp.has(c.id) || needle)
      .sort(
        (a, b) =>
          ROLE_ORDER.indexOf(a.planRole) - ROLE_ORDER.indexOf(b.planRole) ||
          a.store.localeCompare(b.store) ||
          a.name.localeCompare(b.name)
      )
  }, [candidates, plans, q, planByEmp])

  const selected = people.find((p) => p.id === selectedId) || null
  const selectedPlan = selectedId != null ? planByEmp.get(selectedId) : undefined

  const selectPerson = useCallback((id: number) => {
    setSelectedId(id)
    setSuggest(null)
    const p = planByEmp.get(id)
    setRouteStores(p?.route_stores || [])
    setTasks(
      (p?.hqTasks || [])
        .filter((h) => h.status === "todo" || h.status === "doing")
        .map((h) => ({ title: h.title, store: h.store, estMinutes: h.estMinutes }))
    )
    setBriefing(p?.briefing_note || "")
  }, [planByEmp])

  useEffect(() => {
    if (pendingSelect == null || loading || loadedDate !== date) return
    selectPerson(pendingSelect)
    setPendingSelect(null)
  }, [pendingSelect, loading, loadedDate, date, selectPerson])

  const loadSuggest = async () => {
    if (!selected) return
    setSuggestLoading(true)
    try {
      const r = await getVisitSuggestions(selected.id, date)
      setSuggest(r.list)
      if (!r.hasCandidates) await appAlert(t("dp_suggest_no_stores"))
    } finally {
      setSuggestLoading(false)
    }
  }

  const toggleStore = (s: string) =>
    setRouteStores((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  const save = async (publish: boolean) => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await saveDailyPlanAssignment({
        date,
        employeeId: selected.id,
        routeStores: selected.planRole === "supervisor" ? routeStores : undefined,
        tasks: tasks.filter((x) => x.title.trim()),
        briefing,
        publish,
      })
      if (!res.success) {
        await appAlert(res.messageKey ? t(res.messageKey) : translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      await appAlert(publish ? t("dp_published_ok") : t("dp_saved_ok"))
      await load()
    } finally {
      setSaving(false)
    }
  }

  const generateAll = async () => {
    if (!(await appConfirm(t("dp_generate_confirm").replace("{date}", date)))) return
    setSaving(true)
    try {
      const res = await generateDailyPlans(date)
      if (!res.success || !res.result) {
        await appAlert(translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      const r = res.result
      await appAlert(
        t("dp_generate_done")
          .replace("{created}", String(r.created))
          .replace("{existing}", String(r.existing))
          .replace("{skipped}", String(r.skipped))
      )
      await load()
    } finally {
      setSaving(false)
    }
  }

  const copyLine = async () => {
    const lines: string[] = [`📅 ${t("dp_line_title")} ${date}`]
    for (const role of ROLE_ORDER) {
      const list = plans.filter((p) => p.role_scope === role)
      if (list.length === 0) continue
      lines.push("", `**${label.role(role)}**`)
      for (const p of list) {
        const where = (p.route_stores || []).length > 0 ? (p.route_stores || []).join(" → ") : p.store_name
        lines.push(`- ${p.employee_name}: ${where} (${p.total} · ${minutesLabel(p.estMinutes, t)})`)
        for (const h of p.hqTasks.filter((x) => x.status === "todo" || x.status === "doing")) {
          lines.push(`   • ${h.store ? `${h.store} · ` : ""}${h.title}`)
        }
        if (p.briefing_note) lines.push(`   💬 ${p.briefing_note.replace(/\n+/g, " ")}`)
      }
    }
    const text = lines.join("\n")
    try {
      await navigator.clipboard.writeText(text)
      await appAlert(t("dp_line_copied"))
    } catch {
      await appAlert(text)
    }
  }

  const estTotal =
    (selectedPlan?.estMinutes || 0) -
    (selectedPlan?.hqTasks || []).filter((h) => h.status === "todo").reduce((s, h) => s + h.estMinutes, 0) +
    tasks.reduce((s, x) => s + (Number(x.estMinutes) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        {canAssignAll ? (
          <Button size="sm" variant="outline" onClick={() => void generateAll()} disabled={saving}>
            <Sparkles className="mr-1 h-4 w-4" />
            {t("dp_generate_btn")}
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void copyLine()} disabled={plans.length === 0}>
          <Copy className="mr-1 h-4 w-4" />
          {t("dp_line_copy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("dp_assign_hint")}</p>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="space-y-2 p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("dp_search_person")} className="h-8" />
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {people.length === 0 ? (
                <p className="p-3 text-center text-xs text-muted-foreground">{loading ? t("loading") : t("dp_no_people")}</p>
              ) : (
                people.map((c) => {
                  const p = planByEmp.get(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectPerson(c.id)}
                      className={cn(
                        "w-full rounded border p-2 text-left text-xs hover:bg-muted/50",
                        selectedId === c.id && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {label.role(c.planRole)} · {c.store}
                        </span>
                        <span
                          className={cn(
                            "ml-auto rounded px-1 text-[10px]",
                            !p
                              ? "bg-muted text-muted-foreground"
                              : p.published_at
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-100"
                          )}
                        >
                          {!p ? t("dp_no_plan") : p.published_at ? t("dp_published") : t("dp_unpublished")}
                        </span>
                      </div>
                      {p ? (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {(p.route_stores || []).join(" → ") || p.store_name} · {p.total} · {minutesLabel(p.estMinutes, t)}
                        </p>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-3">
            {!selected ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t("dp_pick_person")}</p>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold">
                    {selected.name} <span className="text-xs text-muted-foreground">({label.role(selected.planRole)})</span>
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      estTotal > 420 ? "font-semibold text-red-600" : "text-muted-foreground"
                    )}
                  >
                    {t("dp_est_total")}: {minutesLabel(Math.max(0, estTotal), t)} / {minutesLabel(420, t)}
                    {estTotal > 420 ? ` · ${t("dp_over_capacity")}` : ""}
                  </p>
                </div>

                {selected.planRole === "supervisor" ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <p className="text-xs font-semibold">{t("dp_route_stores")}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={suggestLoading}
                        onClick={() => void loadSuggest()}
                      >
                        <Lightbulb className="mr-1 h-3 w-3" />
                        {t("dp_suggest_btn")}
                      </Button>
                    </div>
                    {suggest ? (
                      <div className="rounded border border-dashed p-2">
                        <p className="mb-1 text-[11px] text-muted-foreground">{t("dp_suggest_hint")}</p>
                        {suggest.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">{t("dp_suggest_empty")}</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {suggest.map((s) => (
                              <button
                                key={s.store}
                                type="button"
                                onClick={() => toggleStore(s.store)}
                                className={cn(
                                  "rounded border px-2 py-0.5 text-left text-[11px]",
                                  routeStores.includes(s.store)
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                )}
                              >
                                {s.store}
                                {s.overdue ? <span className="ml-1 text-red-600">●{s.overdue}</span> : null}
                                {s.pendingVerify ? <span className="ml-1 text-amber-600">●{s.pendingVerify}</span> : null}
                                {s.dueSoon ? <span className="ml-1 text-blue-600">●{s.dueSoon}</span> : null}
                                <span className="ml-1 opacity-70">
                                  {s.daysSinceVisit == null
                                    ? t("dp_never_visited")
                                    : t("dp_days_ago").replace("{n}", String(s.daysSinceVisit))}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {routeStores.length > 0 ? (
                      <p className="text-xs">{routeStores.map((s, i) => `${i + 1}. ${s}`).join("  ")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("dp_route_empty")}</p>
                    )}
                    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                      {(storeList || [])
                        .filter((s) => s && String(s).trim())
                        .sort()
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleStore(s)}
                            className={cn(
                              "rounded border px-2 py-0.5 text-[11px]",
                              routeStores.includes(s) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold">{t("dp_hq_tasks")}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setTasks((prev) => [...prev, { title: "", store: "", estMinutes: 30 }])}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {t("dp_add_task")}
                    </Button>
                  </div>
                  {tasks.length === 0 ? <p className="text-xs text-muted-foreground">{t("dp_no_tasks")}</p> : null}
                  {tasks.map((task, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1">
                      <Input
                        value={task.title}
                        onChange={(e) =>
                          setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                        }
                        placeholder={t("dp_task_title")}
                        className="h-8 min-w-[200px] flex-1"
                      />
                      <select
                        value={task.store}
                        onChange={(e) =>
                          setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, store: e.target.value } : x)))
                        }
                        className="h-8 rounded border bg-background px-1 text-xs"
                      >
                        <option value="">{t("dp_task_no_store")}</option>
                        {(selected.planRole === "supervisor" && routeStores.length > 0 ? routeStores : [selected.store])
                          .filter(Boolean)
                          .map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                      </select>
                      <Input
                        type="number"
                        min={0}
                        value={task.estMinutes}
                        onChange={(e) =>
                          setTasks((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, estMinutes: Number(e.target.value) || 0 } : x))
                          )
                        }
                        className="h-8 w-20"
                        title={t("dp_est_min")}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold">{t("dp_briefing")}</p>
                  <Textarea
                    value={briefing}
                    onChange={(e) => setBriefing(e.target.value)}
                    rows={3}
                    placeholder={t("dp_briefing_ph")}
                  />
                </div>

                {selectedPlan?.status === "closed" ? (
                  <p className="text-xs text-amber-600">{t("dp_err_closed")}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={saving} onClick={() => void save(false)}>
                      {t("dp_save_draft")}
                    </Button>
                    <Button disabled={saving} onClick={() => void save(true)}>
                      <Send className="mr-1 h-4 w-4" />
                      {t("dp_save_publish")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
