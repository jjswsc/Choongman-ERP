"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/fetch"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

type TenantOpt = { id: string; companyName: string }

type EmpRow = {
  id: number
  tenantId: string
  company: string
  store: string
  name: string
  role: string
  job: string
  employeeCode: string
  resignDate: string
  createdAt: string
}
type RoleOption = "Staff" | "Manager" | "Franchisee" | "Officer" | "Director"
type RowDraft = { role: RoleOption; job: string }
type EmploymentStatusFilter = "all" | "active" | "resigned"

type SearchFilters = {
  tenantId: string
  q: string
  employmentStatus: EmploymentStatusFilter
}

const ROLE_OPTIONS: RoleOption[] = ["Staff", "Manager", "Franchisee", "Officer", "Director"]

function normalizeRole(v: string): RoleOption {
  const hit = ROLE_OPTIONS.find((x) => x.toLowerCase() === String(v || "").trim().toLowerCase())
  return hit || "Staff"
}

export default function SaasUsersPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [tenantFilter, setTenantFilter] = useState<string>("")
  const [qInput, setQInput] = useState("")
  const [qApplied, setQApplied] = useState("")
  const [employmentStatusInput, setEmploymentStatusInput] = useState<EmploymentStatusFilter>("active")
  const [employmentStatusApplied, setEmploymentStatusApplied] = useState<EmploymentStatusFilter>("active")
  const [hasSearched, setHasSearched] = useState(false)
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<EmpRow[]>([])
  const [tenantOptions, setTenantOptions] = useState<TenantOpt[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState("")
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [savingIds, setSavingIds] = useState<number[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkRole, setBulkRole] = useState<RoleOption>("Staff")

  const load = useCallback(
    async (opts: { nextOffset: number; append: boolean; filters?: SearchFilters }) => {
      const filters = opts.filters ?? {
        tenantId: tenantFilter,
        q: qApplied,
        employmentStatus: employmentStatusApplied,
      }
      setLoading(true)
      setNotice("")
      try {
        const params = new URLSearchParams()
        if (filters.tenantId) params.set("tenantId", filters.tenantId)
        if (filters.q.trim()) params.set("q", filters.q.trim())
        if (filters.employmentStatus !== "all") params.set("employmentStatus", filters.employmentStatus)
        params.set("offset", String(opts.nextOffset))
        params.set("limit", "200")
        const res = await apiFetch(`/api/saasAdminEmployees?${params.toString()}`)
        const json = (await res.json()) as {
          success?: boolean
          message?: string
          tenantOptions?: TenantOpt[]
          rows?: EmpRow[]
          pagination?: { hasMore?: boolean }
        }
        if (!res.ok || json.success !== true) {
          setNotice(json.message || t("saasAdmin_errLoadList"))
          if (!opts.append) setRows([])
          return
        }
        if (Array.isArray(json.tenantOptions)) setTenantOptions(json.tenantOptions)
        const next = json.rows || []
        setRows((prev) => (opts.append ? [...prev, ...next] : next))
        setOffset(opts.nextOffset + next.length)
        setHasMore(Boolean(json.pagination?.hasMore))
      } catch (e) {
        setNotice(String(e))
        if (!opts.append) setRows([])
      } finally {
        setLoading(false)
      }
    },
    [tenantFilter, qApplied, employmentStatusApplied, t]
  )

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch("/api/saasAdminEmployees?metaOnly=1")
        const json = (await res.json()) as { success?: boolean; tenantOptions?: TenantOpt[] }
        if (res.ok && json.success === true && Array.isArray(json.tenantOptions)) {
          setTenantOptions(json.tenantOptions)
        }
      } catch {
        // tenant dropdown is optional until first search
      }
    })()
  }, [])

  useEffect(() => {
    const allowed = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)))
  }, [rows])

  const applySearch = () => {
    const nextFilters: SearchFilters = {
      tenantId: tenantFilter,
      q: qInput.trim(),
      employmentStatus: employmentStatusInput,
    }
    setHasSearched(true)
    setQApplied(nextFilters.q)
    setEmploymentStatusApplied(nextFilters.employmentStatus)
    setOffset(0)
    void load({ nextOffset: 0, append: false, filters: nextFilters })
  }

  const loadMore = () => {
    if (!hasSearched || !hasMore || loading) return
    void load({ nextOffset: offset, append: true })
  }
  const isSaving = (id: number) => savingIds.includes(id)
  const setSaving = (id: number, on: boolean) => {
    setSavingIds((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)))
  }
  const draftFor = (row: EmpRow): RowDraft => {
    const cached = drafts[row.id]
    if (cached) return cached
    return { role: normalizeRole(row.role), job: row.job || "" }
  }
  const updateDraft = (id: number, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const base = prev[id] || { role: "Staff", job: "" }
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  const saveEmployeeDraft = async (row: EmpRow) => {
    const draft = draftFor(row)
    const changedRole = draft.role !== normalizeRole(row.role)
    const changedJob = draft.job.trim() !== String(row.job || "").trim()
    if (!changedRole && !changedJob) {
      await appAlert(t("saasAdminUser_noChanges"))
      return
    }
    setSaving(row.id, true)
    try {
      const res = await apiFetch("/api/saasAdminEmployees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          role: draft.role,
          job: draft.job.trim(),
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminUser_saveFailed"))
        return
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, role: draft.role, job: draft.job.trim() } : x)))
      await appAlert(t("saasAdminUser_saved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(row.id, false)
    }
  }

  const toggleResign = async (row: EmpRow) => {
    const isResigned = Boolean(row.resignDate)
    const nextDate = isResigned ? null : new Date().toISOString().slice(0, 10)
    const action = isResigned ? t("saasAdminUser_actionRestore") : t("saasAdminUser_actionResign")
    const ok = await appConfirm(
      tr(t, "saasAdminUser_toggleConfirm", {
        company: row.company || "-",
        store: row.store || "-",
        name: row.name,
        action,
      })
    )
    if (!ok) return
    setSaving(row.id, true)
    try {
      const res = await apiFetch("/api/saasAdminEmployees", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          resignDate: nextDate,
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminUser_statusChangeFailed"))
        return
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, resignDate: nextDate || "" } : x)))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(row.id, false)
    }
  }

  const employeeAdminLink = (row: EmpRow): string => {
    const p = new URLSearchParams()
    if (row.company) p.set("company", row.company)
    if (row.store) p.set("store", row.store)
    if (row.name) p.set("name", row.name)
    return `/admin/employees?${p.toString()}`
  }
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id))
  const allChecked = rows.length > 0 && selectedIds.length === rows.length
  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id]
      return prev.filter((x) => x !== id)
    })
  }
  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds([])
      return
    }
    setSelectedIds(rows.map((r) => r.id))
  }

  const patchEmployee = async (payload: { id: number; role?: string; job?: string; resignDate?: string | null }) => {
    const res = await apiFetch("/api/saasAdminEmployees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = (await res.json()) as { success?: boolean; message?: string }
    if (!res.ok || json.success !== true) throw new Error(json.message || t("saasAdminUser_updateFailed"))
  }

  const bulkApplyRole = async () => {
    if (selectedRows.length === 0) {
      await appAlert(t("saasAdminUser_selectBulkFirst"))
      return
    }
    const ok = await appConfirm(tr(t, "saasAdminUser_bulkRoleConfirm", { n: selectedRows.length, role: bulkRole }))
    if (!ok) return
    setSavingIds((prev) => [...new Set([...prev, ...selectedRows.map((r) => r.id)])])
    try {
      const results = await Promise.allSettled(selectedRows.map((r) => patchEmployee({ id: r.id, role: bulkRole })))
      const successIds = selectedRows.filter((_, idx) => results[idx]?.status === "fulfilled").map((r) => r.id)
      const failCount = selectedRows.length - successIds.length
      if (successIds.length > 0) {
        setRows((prev) => prev.map((x) => (successIds.includes(x.id) ? { ...x, role: bulkRole } : x)))
        setDrafts((prev) => {
          const next = { ...prev }
          for (const id of successIds) {
            const base = next[id] || { role: "Staff", job: "" }
            next[id] = { ...base, role: bulkRole }
          }
          return next
        })
      }
      await appAlert(
        failCount > 0
          ? tr(t, "saasAdminUser_bulkRolePartial", { ok: successIds.length, fail: failCount })
          : tr(t, "saasAdminUser_bulkRoleDone", { n: successIds.length })
      )
    } finally {
      setSavingIds((prev) => prev.filter((id) => !selectedRows.some((r) => r.id === id)))
    }
  }

  const bulkSetResign = async (resign: boolean) => {
    if (selectedRows.length === 0) {
      await appAlert(t("saasAdminUser_selectBulkFirst"))
      return
    }
    const action = resign ? t("saasAdminUser_bulkResignAction") : t("saasAdminUser_bulkRestoreAction")
    const ok = await appConfirm(tr(t, "saasAdminUser_bulkResignConfirm", { n: selectedRows.length, action }))
    if (!ok) return
    const targetDate = resign ? new Date().toISOString().slice(0, 10) : null
    setSavingIds((prev) => [...new Set([...prev, ...selectedRows.map((r) => r.id)])])
    try {
      const results = await Promise.allSettled(selectedRows.map((r) => patchEmployee({ id: r.id, resignDate: targetDate })))
      const successIds = selectedRows.filter((_, idx) => results[idx]?.status === "fulfilled").map((r) => r.id)
      const failCount = selectedRows.length - successIds.length
      if (successIds.length > 0) {
        setRows((prev) => prev.map((x) => (successIds.includes(x.id) ? { ...x, resignDate: targetDate || "" } : x)))
      }
      await appAlert(
        failCount > 0
          ? tr(t, "saasAdminUser_bulkResignPartial", { action, ok: successIds.length, fail: failCount })
          : tr(t, "saasAdminUser_bulkResignDone", { action, n: successIds.length })
      )
    } finally {
      setSavingIds((prev) => prev.filter((id) => !selectedRows.some((r) => r.id === id)))
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("saasAdminUser_pageTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("saasAdminUser_pageIntro")}</p>
        <p className="mt-2 text-sm">
          {t("saasAdminUser_pageHintBefore")}
          <strong>{t("saasAdminUser_pageHintStrong")}</strong>
          {t("saasAdminUser_pageHintMid")}
          <Link href="/saas-admin/onboarding" className="text-primary underline underline-offset-4">
            {t("saasAdminUser_pageHintLink")}
          </Link>
          {t("saasAdminUser_pageHintAfter")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdmin_filter")}</CardTitle>
          <CardDescription>{t("saasAdmin_filterTenantHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
          <div className="space-y-2 md:min-w-[220px]">
            <Label>{t("saasAdmin_labelTenant")}</Label>
            <Select value={tenantFilter || "__all__"} onValueChange={(v) => setTenantFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("all")}</SelectItem>
                {tenantOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.companyName || opt.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:min-w-[180px]">
            <Label>{t("saasAdminUser_statusFilter")}</Label>
            <Select
              value={employmentStatusInput}
              onValueChange={(v) => setEmploymentStatusInput(v as EmploymentStatusFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("emp_status_all")}</SelectItem>
                <SelectItem value="active">{t("emp_status_active")}</SelectItem>
                <SelectItem value="resigned">{t("emp_status_resigned")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-end">
            <div className="space-y-2 md:flex-1">
              <Label>{t("saasAdminUser_searchLabel")}</Label>
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch()
                }}
                placeholder={t("saasAdmin_searchPlaceholder")}
              />
            </div>
            <Button type="button" variant="secondary" onClick={applySearch} disabled={loading}>
              {t("search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("saasAdminUser_listTitle")}</CardTitle>
          <CardDescription>
            {!hasSearched
              ? t("saasAdminUser_searchHint")
              : loading
                ? t("saasAdmin_loading")
                : tr(t, "saasAdmin_rowsShown", { n: rows.length })}
            {hasSearched && qApplied ? t("saasAdmin_searchModeUsers") : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {hasSearched ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border p-3">
            <span className="text-sm text-muted-foreground">{tr(t, "saasAdminUser_selectedCount", { n: selectedIds.length })}</span>
            <Select value={bulkRole} onValueChange={(v) => setBulkRole(normalizeRole(v))}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" variant="secondary" onClick={() => void bulkApplyRole()} disabled={selectedIds.length === 0}>
              {t("saasAdminUser_bulkApplyRole")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void bulkSetResign(true)}
              disabled={selectedIds.length === 0}
            >
              {t("saasAdminUser_bulkResign")}
            </Button>
            <Button type="button" size="sm" variant="default" onClick={() => void bulkSetResign(false)} disabled={selectedIds.length === 0}>
              {t("saasAdminUser_bulkRestore")}
            </Button>
          </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[52px]">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(Boolean(v))} aria-label={t("saasAdminUser_selectAll")} />
                </TableHead>
                <TableHead>{t("saasAdminUser_colCompany")}</TableHead>
                <TableHead>{t("saasAdmin_tenantId")}</TableHead>
                <TableHead>{t("saasAdminUser_colStore")}</TableHead>
                <TableHead>{t("saasAdminUser_colName")}</TableHead>
                <TableHead>{t("saasAdminUser_colRole")}</TableHead>
                <TableHead>{t("saasAdminUser_colJob")}</TableHead>
                <TableHead>{t("saasAdminUser_colEmployeeCode")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("saasAdmin_manage")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hasSearched ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    {t("saasAdminUser_searchHint")}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    {t("saasAdmin_noData")}
                  </TableCell>
                </TableRow>
              ) : loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    {t("saasAdmin_loading")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={(v) => toggleRow(r.id, Boolean(v))}
                        aria-label={tr(t, "saasAdminUser_selectRow", { name: r.name })}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.company || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.tenantId || "—"}</TableCell>
                    <TableCell>{r.store || "—"}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="min-w-[150px]">
                      <Select
                        value={draftFor(r).role}
                        onValueChange={(v) => updateDraft(r.id, { role: normalizeRole(v) })}
                        disabled={isSaving(r.id)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((x) => (
                            <SelectItem key={x} value={x}>
                              {x}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-[180px]">
                      <Input
                        value={draftFor(r).job}
                        onChange={(e) => updateDraft(r.id, { job: e.target.value })}
                        className="h-8"
                        disabled={isSaving(r.id)}
                        placeholder={t("saasAdminUser_jobPh")}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{r.employeeCode || "—"}</TableCell>
                    <TableCell>
                      {r.resignDate ? (
                        <Badge variant="secondary">{tr(t, "saasAdminUser_statusResigned", { date: r.resignDate })}</Badge>
                      ) : (
                        <Badge variant="outline">{t("saasAdminUser_statusActive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" onClick={() => void saveEmployeeDraft(r)} disabled={isSaving(r.id)}>
                          {t("save")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={r.resignDate ? "default" : "destructive"}
                          onClick={() => void toggleResign(r)}
                          disabled={isSaving(r.id)}
                        >
                          {r.resignDate ? t("saasAdminUser_restore") : t("saasAdminUser_resign")}
                        </Button>
                        <Button asChild type="button" size="sm" variant="outline">
                          <Link href={employeeAdminLink(r)}>{t("saasAdminUser_erpLink")}</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasSearched && hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
                {t("saasAdmin_loadMore")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
