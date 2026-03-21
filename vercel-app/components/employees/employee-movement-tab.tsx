"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminEmployeeList, type AdminEmployeeItem } from "@/lib/api-client"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import { isEmployedAsOf, joinInPeriod, resignInPeriod } from "@/lib/employee-headcount-utils"

type Agg = { joins: number; resigns: number; headEnd: number }

function emptyAgg(): Agg {
  return { joins: 0, resigns: 0, headEnd: 0 }
}

export function EmployeeMovementTab({
  userStore,
  userRole,
}: {
  userStore: string
  userRole: string
}) {
  const t = useT(useLang().lang)
  const defaultYm = React.useMemo(() => getBangkokMonthRange().yearMonth, [])
  const [yearMonth, setYearMonth] = React.useState(defaultYm)
  const { startStr, endStr } = React.useMemo(() => getBangkokMonthRange(yearMonth), [yearMonth])
  const [storeFilter, setStoreFilter] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [list, setList] = React.useState<AdminEmployeeItem[]>([])
  const [stores, setStores] = React.useState<string[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminEmployeeList({ userStore, userRole })
      setList(res.list || [])
      setStores(res.stores || [])
    } finally {
      setLoading(false)
    }
  }, [userStore, userRole])

  React.useEffect(() => {
    void load()
  }, [load])

  const filtered = React.useMemo(() => {
    const sf = storeFilter.trim()
    if (!sf) return list
    return list.filter((e) => String(e.store || "").trim() === sf)
  }, [list, storeFilter])

  const totals = React.useMemo(() => {
    let joins = 0
    let resigns = 0
    let headEnd = 0
    for (const e of filtered) {
      if (joinInPeriod(e.join, startStr, endStr)) joins++
      if (resignInPeriod(e.resign, startStr, endStr)) resigns++
      if (isEmployedAsOf(e.join, e.resign, endStr)) headEnd++
    }
    return { joins, resigns, headEnd }
  }, [filtered, startStr, endStr])

  const byStore = React.useMemo(() => {
    const m = new Map<string, Agg>()
    for (const e of filtered) {
      const st = String(e.store || "").trim() || "—"
      if (!m.has(st)) m.set(st, emptyAgg())
      const a = m.get(st)!
      if (joinInPeriod(e.join, startStr, endStr)) a.joins++
      if (resignInPeriod(e.resign, startStr, endStr)) a.resigns++
      if (isEmployedAsOf(e.join, e.resign, endStr)) a.headEnd++
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [filtered, startStr, endStr])

  const byJob = React.useMemo(() => {
    const m = new Map<string, Agg>()
    for (const e of filtered) {
      const job = String(e.job || "").trim() || "—"
      if (!m.has(job)) m.set(job, emptyAgg())
      const a = m.get(job)!
      if (joinInPeriod(e.join, startStr, endStr)) a.joins++
      if (resignInPeriod(e.resign, startStr, endStr)) a.resigns++
      if (isEmployedAsOf(e.join, e.resign, endStr)) a.headEnd++
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [filtered, startStr, endStr])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("emp_mov_month")}</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value || defaultYm)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="text-xs text-muted-foreground pt-5">
          {startStr} ~ {endStr}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("emp_label_store")}</label>
          <select
            value={storeFilter || "All"}
            onChange={(e) => setStoreFilter(e.target.value === "All" ? "" : e.target.value)}
            className="h-9 min-w-[160px] rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="All">{t("stockFilterStoreAll")}</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? t("loading") : t("emp_mov_load")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
          <div className="text-xs text-muted-foreground">{t("emp_mov_joins")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{totals.joins}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
          <div className="text-xs text-muted-foreground">{t("emp_mov_resigns")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{totals.resigns}</div>
        </div>
        <div className="rounded-lg border border-border bg-primary/10 px-4 py-3 text-center">
          <div className="text-xs text-muted-foreground">{t("emp_mov_head_end")}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground">{totals.headEnd}</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">{t("emp_mov_by_store")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-left">
                <th className="px-3 py-2 font-semibold">{t("emp_label_store")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_joins")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_resigns")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_head_end")}</th>
              </tr>
            </thead>
            <tbody>
              {byStore.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    {t("emp_result_empty")}
                  </td>
                </tr>
              ) : (
                byStore.map(([st, a]) => (
                  <tr key={st} className="border-b border-border/60 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{st}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.joins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.resigns}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{a.headEnd}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">{t("emp_mov_by_job")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-left">
                <th className="px-3 py-2 font-semibold">{t("emp_label_job")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_joins")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_resigns")}</th>
                <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_mov_head_end")}</th>
              </tr>
            </thead>
            <tbody>
              {byJob.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    {t("emp_result_empty")}
                  </td>
                </tr>
              ) : (
                byJob.map(([job, a]) => (
                  <tr key={job} className="border-b border-border/60 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{job}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.joins}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.resigns}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{a.headEnd}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
