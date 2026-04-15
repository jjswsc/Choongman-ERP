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

const ROLE_OPTIONS: RoleOption[] = ["Staff", "Manager", "Franchisee", "Officer", "Director"]

function normalizeRole(v: string): RoleOption {
  const hit = ROLE_OPTIONS.find((x) => x.toLowerCase() === String(v || "").trim().toLowerCase())
  return hit || "Staff"
}

export default function SaasUsersPage() {
  const [tenantFilter, setTenantFilter] = useState<string>("")
  const [qInput, setQInput] = useState("")
  const [qApplied, setQApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<EmpRow[]>([])
  const [tenantOptions, setTenantOptions] = useState<TenantOpt[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [savingIds, setSavingIds] = useState<number[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkRole, setBulkRole] = useState<RoleOption>("Staff")

  const load = useCallback(
    async (opts: { nextOffset: number; append: boolean }) => {
      setLoading(true)
      setNotice("")
      try {
        const params = new URLSearchParams()
        if (tenantFilter) params.set("tenantId", tenantFilter)
        if (qApplied.trim()) params.set("q", qApplied.trim())
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
          setNotice(json.message || "목록을 불러오지 못했습니다.")
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
    [tenantFilter, qApplied]
  )

  useEffect(() => {
    setOffset(0)
    void load({ nextOffset: 0, append: false })
  }, [tenantFilter, qApplied, load])

  useEffect(() => {
    const allowed = new Set(rows.map((r) => r.id))
    setSelectedIds((prev) => prev.filter((id) => allowed.has(id)))
  }, [rows])

  const applySearch = () => {
    setQApplied(qInput.trim())
  }

  const loadMore = () => {
    if (!hasMore || loading) return
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
      await appAlert("변경된 값이 없습니다.")
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
        await appAlert(json.message || "직원 수정에 실패했습니다.")
        return
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, role: draft.role, job: draft.job.trim() } : x)))
      await appAlert("직원 정보를 저장했습니다.")
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(row.id, false)
    }
  }

  const toggleResign = async (row: EmpRow) => {
    const isResigned = Boolean(row.resignDate)
    const nextDate = isResigned ? null : new Date().toISOString().slice(0, 10)
    const ok = await appConfirm(
      `[${row.company || "-"} / ${row.store || "-"} / ${row.name}] 계정을 ${isResigned ? "재직 복구" : "퇴사 처리"}할까요?`
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
        await appAlert(json.message || "재직 상태 변경에 실패했습니다.")
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
    if (!res.ok || json.success !== true) throw new Error(json.message || "업데이트 실패")
  }

  const bulkApplyRole = async () => {
    if (selectedRows.length === 0) {
      await appAlert("일괄 변경할 직원을 먼저 선택해 주세요.")
      return
    }
    const ok = await appConfirm(`선택한 ${selectedRows.length}명 직원의 역할을 [${bulkRole}]로 변경할까요?`)
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
          ? `역할 일괄 변경 완료: 성공 ${successIds.length}명, 실패 ${failCount}명`
          : `역할을 ${successIds.length}명에게 적용했습니다.`
      )
    } finally {
      setSavingIds((prev) => prev.filter((id) => !selectedRows.some((r) => r.id === id)))
    }
  }

  const bulkSetResign = async (resign: boolean) => {
    if (selectedRows.length === 0) {
      await appAlert("일괄 처리할 직원을 먼저 선택해 주세요.")
      return
    }
    const label = resign ? "퇴사 처리" : "재직 복구"
    const ok = await appConfirm(`선택한 ${selectedRows.length}명 직원을 ${label}할까요?`)
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
          ? `${label} 완료: 성공 ${successIds.length}명, 실패 ${failCount}명`
          : `${label}를 ${successIds.length}명에게 적용했습니다.`
      )
    } finally {
      setSavingIds((prev) => prev.filter((id) => !selectedRows.some((r) => r.id === id)))
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">사용자(직원) 관리</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          모든 고객사의 <code className="rounded bg-muted px-1">employees</code> 계정을 한 화면에서 조회합니다. 비밀번호는 표시하지 않습니다.
        </p>
        <p className="mt-2 text-sm">
          신규 고객사의 <strong>첫 관리자</strong>는{" "}
          <Link href="/saas-admin/customers" className="text-primary underline underline-offset-4">
            고객사 → 초기 로그인
          </Link>{" "}
          탭에서 만든 뒤, 이후 직원은 해당 회사 ERP의 직원 메뉴에서 추가하는 흐름을 권장합니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">필터</CardTitle>
          <CardDescription>고객사(테넌트)별로 직원 목록을 좁힐 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="space-y-2 md:min-w-[220px]">
            <Label>고객사</Label>
            <Select value={tenantFilter || "__all__"} onValueChange={(v) => setTenantFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                {tenantOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.companyName || t.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-end">
            <div className="space-y-2 md:flex-1">
              <Label>검색 (이름·매장·회사·역할)</Label>
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch()
                }}
                placeholder="입력 후 검색"
              />
            </div>
            <Button type="button" variant="secondary" onClick={applySearch} disabled={loading}>
              검색
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">직원 목록</CardTitle>
          <CardDescription>
            {loading ? "불러오는 중…" : `${rows.length}건 표시`}
            {qApplied ? " · 검색 모드(최대 8000건까지 조회 후 필터)" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border p-3">
            <span className="text-sm text-muted-foreground">선택 {selectedIds.length}명</span>
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
              역할 일괄 적용
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void bulkSetResign(true)}
              disabled={selectedIds.length === 0}
            >
              선택 퇴사
            </Button>
            <Button type="button" size="sm" variant="default" onClick={() => void bulkSetResign(false)} disabled={selectedIds.length === 0}>
              선택 복구
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[52px]">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(Boolean(v))} aria-label="전체 선택" />
                </TableHead>
                <TableHead>회사명</TableHead>
                <TableHead>테넌트 ID</TableHead>
                <TableHead>매장</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>직무</TableHead>
                <TableHead>직원코드</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={(v) => toggleRow(r.id, Boolean(v))}
                        aria-label={`${r.name} 선택`}
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
                        placeholder="예: officer"
                      />
                    </TableCell>
                    <TableCell className="text-xs">{r.employeeCode || "—"}</TableCell>
                    <TableCell>
                      {r.resignDate ? (
                        <Badge variant="secondary">퇴사 {r.resignDate}</Badge>
                      ) : (
                        <Badge variant="outline">재직</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" onClick={() => void saveEmployeeDraft(r)} disabled={isSaving(r.id)}>
                          저장
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={r.resignDate ? "default" : "destructive"}
                          onClick={() => void toggleResign(r)}
                          disabled={isSaving(r.id)}
                        >
                          {r.resignDate ? "복구" : "퇴사"}
                        </Button>
                        <Button asChild type="button" size="sm" variant="outline">
                          <Link href={employeeAdminLink(r)}>ERP 직원</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
                더 보기
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
