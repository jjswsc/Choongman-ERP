"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getAdminEmployeeList,
  getStoreJobHeadcount,
  saveStoreJobHeadcount,
  type AdminEmployeeItem,
  type StoreJobHeadcountRow,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { isEmployedAsOf } from "@/lib/employee-headcount-utils"

export function EmployeeHeadcountTab({
  userStore,
  userRole,
  isManager,
}: {
  userStore: string
  userRole: string
  isManager: boolean
}) {
  const t = useT(useLang().lang)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [empList, setEmpList] = React.useState<AdminEmployeeItem[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [jobOptions, setJobOptions] = React.useState<string[]>([])
  const [headList, setHeadList] = React.useState<StoreJobHeadcountRow[]>([])
  const [tableMissing, setTableMissing] = React.useState(false)
  const [selectedStore, setSelectedStore] = React.useState("")
  const [localRows, setLocalRows] = React.useState<{ job: string; target: number }[]>([])
  const [addJobPick, setAddJobPick] = React.useState("")

  const todayBkk = React.useMemo(() => getBangkokTodayDateString(), [])

  const loadAll = React.useCallback(async () => {
    setLoading(true)
    try {
      const [empRes, hcRes] = await Promise.all([
        getAdminEmployeeList({ userStore, userRole }),
        getStoreJobHeadcount(),
      ])
      setEmpList(empRes.list || [])
      setStores(empRes.stores || [])
      setJobOptions(
        empRes.jobOptions?.length ? empRes.jobOptions : ["Service", "Kitchen", "Officer", "Director", "Logistic"]
      )
      setHeadList(hcRes.list || [])
      if (hcRes._note === "table_missing") setTableMissing(true)
      else setTableMissing(false)
    } finally {
      setLoading(false)
    }
  }, [userStore, userRole])

  React.useEffect(() => {
    void loadAll()
  }, [loadAll])

  React.useEffect(() => {
    if (isManager && userStore) {
      setSelectedStore(userStore)
      return
    }
    if (!selectedStore && stores.length > 0) {
      setSelectedStore(stores[0] || "")
    }
  }, [stores, selectedStore, isManager, userStore])

  React.useEffect(() => {
    if (!selectedStore) {
      setLocalRows([])
      return
    }
    const fromHc = headList.filter((h) => h.store === selectedStore)
    const hcMap = new Map(fromHc.map((h) => [h.job, h.target_count]))
    const jobs = new Set<string>()
    for (const e of empList) {
      if (String(e.store || "").trim() !== selectedStore) continue
      const j = String(e.job || "").trim()
      if (j) jobs.add(j)
    }
    for (const h of fromHc) {
      if (h.job) jobs.add(h.job)
    }
    const sorted = [...jobs].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    setLocalRows(sorted.map((job) => ({ job, target: hcMap.get(job) ?? 0 })))
  }, [selectedStore, headList, empList])

  const actualByJob = React.useMemo(() => {
    const m = new Map<string, number>()
    if (!selectedStore) return m
    for (const e of empList) {
      if (String(e.store || "").trim() !== selectedStore) continue
      if (!isEmployedAsOf(e.join, e.resign, todayBkk)) continue
      const j = String(e.job || "").trim() || "—"
      m.set(j, (m.get(j) || 0) + 1)
    }
    return m
  }, [empList, selectedStore, todayBkk])

  const storeChoices = React.useMemo(() => {
    if (isManager && userStore) return [userStore]
    return stores
  }, [isManager, userStore, stores])

  const unusedJobOptions = React.useMemo(() => {
    const have = new Set(localRows.map((r) => r.job))
    return jobOptions.filter((j) => j && !have.has(j))
  }, [jobOptions, localRows])

  const updateTarget = (job: string, val: number) => {
    setLocalRows((prev) => prev.map((r) => (r.job === job ? { ...r, target: Math.max(0, Math.floor(val) || 0) } : r)))
  }

  const handleAddJob = () => {
    const j = addJobPick.trim()
    if (!j) return
    if (localRows.some((r) => r.job === j)) return
    setLocalRows((prev) => [...prev, { job: j, target: 0 }].sort((a, b) => a.job.localeCompare(b.job)))
    setAddJobPick("")
  }

  const handleSave = async () => {
    if (!selectedStore) return
    setSaving(true)
    try {
      const res = await saveStoreJobHeadcount({
        store: selectedStore,
        rows: localRows.map((r) => ({ job: r.job, target_count: r.target })),
      })
      alert(translateApiMessage(res.message || "", t) || (res.success ? t("msg_saved") : t("msg_save_fail")))
      if (res.success) await loadAll()
    } catch (e) {
      console.error(e)
      alert(t("msg_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (actual: number, target: number) => {
    if (actual < target) {
      return (
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-800 dark:text-amber-200">{t("emp_hc_under")}</span>
      )
    }
    if (actual > target) {
      return <span className="rounded bg-sky-500/20 px-2 py-0.5 text-sky-800 dark:text-sky-200">{t("emp_hc_over")}</span>
    }
    return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-800 dark:text-emerald-200">{t("emp_hc_ok")}</span>
  }

  if (loading && empList.length === 0) {
    return (
      <div className="flex justify-center py-16 text-sm text-muted-foreground">{t("loading")}</div>
    )
  }

  return (
    <div className="space-y-4">
      {tableMissing && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {t("emp_hc_table_missing")}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("emp_hc_select_store")}</label>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            disabled={isManager && !!userStore}
            className="h-9 min-w-[200px] rounded-md border border-input bg-background px-2 text-sm disabled:opacity-70"
          >
            {storeChoices.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
        >
          {t("emp_mov_load")}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !selectedStore || tableMissing}
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? t("loading") : t("emp_hc_save")}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/20 p-3">
        <span className="text-xs text-muted-foreground">{t("emp_hc_add_job")}</span>
        <select
          value={addJobPick}
          onChange={(e) => setAddJobPick(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[140px]"
        >
          <option value="">{t("emp_job_all")}</option>
          {unusedJobOptions.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAddJob}
          disabled={!addJobPick}
          className="h-8 rounded-md bg-secondary px-2 text-xs font-medium disabled:opacity-50"
        >
          +
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-3 py-2 font-semibold">{t("emp_label_job")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_target")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_actual")}</th>
              <th className="px-3 py-2 font-semibold text-right tabular-nums">{t("emp_hc_diff")}</th>
              <th className="px-3 py-2 font-semibold">{t("emp_hc_status_short")}</th>
            </tr>
          </thead>
          <tbody>
            {localRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  {selectedStore ? t("emp_hc_empty_jobs") : t("emp_hc_select_store")}
                </td>
              </tr>
            ) : (
              localRows.map((row) => {
                const actual = actualByJob.get(row.job) || 0
                const diff = actual - row.target
                return (
                  <tr key={row.job} className="border-b border-border/60 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium">{row.job}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.target}
                        onChange={(e) => updateTarget(row.job, Number(e.target.value))}
                        className="w-16 rounded border border-input bg-background px-1 py-0.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{actual}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        diff < 0 ? "text-amber-700 dark:text-amber-300" : diff > 0 ? "text-sky-700 dark:text-sky-300" : ""
                      }`}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="px-3 py-2">{statusBadge(actual, row.target)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t("emp_hc_asof_hint")}</p>
    </div>
  )
}
