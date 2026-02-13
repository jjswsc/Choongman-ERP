"use client"

import * as React from "react"
import {
  CalendarIcon,
  Search,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Building2,
  User,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import {
  getWorkLogManagerReport,
  updateWorkLogManagerCheck,
  getWorkLogOfficeOptions,
  type WorkLogManagerItem,
} from "@/lib/api-client"

function defaultStartStr() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function WorklogApproval() {
  const { auth } = useAuth()
  const canReject = (auth?.role || "").toLowerCase() === "director"
  const [startStr, setStartStr] = React.useState(defaultStartStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [deptFilter, setDeptFilter] = React.useState("all")
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [depts, setDepts] = React.useState<string[]>([])
  const [staffList, setStaffList] = React.useState<{ name: string; displayName: string }[]>([])
  const [list, setList] = React.useState<WorkLogManagerItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [updating, setUpdating] = React.useState<string | null>(null)

  React.useEffect(() => {
    getWorkLogOfficeOptions().then((r) => {
      setDepts(r.depts || [])
      setStaffList(r.staff || [])
    })
  }, [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getWorkLogManagerReport({
        startStr,
        endStr,
        dept: deptFilter,
        employee: employeeFilter,
        status: statusFilter,
      })
      setList(res)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, deptFilter, employeeFilter, statusFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleApprove = async (id: string) => {
    setUpdating(id)
    try {
      const res = await updateWorkLogManagerCheck({ id, status: "승인" })
      if (res.success) loadData()
      else alert(res.message || "승인 실패")
    } catch {
      alert("처리 중 오류 발생")
    } finally {
      setUpdating(null)
    }
  }

  const handleReject = async (id: string) => {
    const comment = prompt("반려 사유를 입력하세요 (선택)")
    setUpdating(id)
    try {
      const res = await updateWorkLogManagerCheck({
        id,
        status: "반려",
        comment: comment || undefined,
      })
      if (res.success) loadData()
      else alert(res.message || "반려 처리 실패")
    } catch {
      alert("처리 중 오류 발생")
    } finally {
      setUpdating(null)
    }
  }

  const pendingItems = list.filter((it) => it.managerCheck === "대기")
  const byDept = React.useMemo(() => {
    const map: Record<string, Record<string, WorkLogManagerItem[]>> = {}
    for (const it of list) {
      const d = it.dept || "기타"
      const n = it.name || ""
      if (!map[d]) map[d] = {}
      if (!map[d][n]) map[d][n] = []
      map[d][n].push(it)
    }
    return map
  }, [list])

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              기간
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-36 text-xs"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-9 w-36 text-xs"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              부서
            </label>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {depts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              직원
            </label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.name} value={s.displayName || s.name}>
                    {s.displayName || s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-foreground">상태</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="대기">대기</SelectItem>
                <SelectItem value="승인">승인</SelectItem>
                <SelectItem value="반려">반려</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={loadData} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
        </div>
      </div>

      {/* Table by dept/employee */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-6 py-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">업무일지 승인</h3>
          {pendingItems.length > 0 && (
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
              대기 {pendingItems.length}건
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              조회된 업무일지가 없습니다.
            </div>
          ) : (
            <div className="divide-y">
              {Object.entries(byDept).map(([dept, byName]) => (
                <div key={dept}>
                  {Object.entries(byName).map(([name, items]) => (
                    <div key={`${dept}-${name}`} className="border-b last:border-b-0">
                      <div className="bg-muted/20 px-5 py-2 text-xs font-bold text-muted-foreground">
                        {dept} · {staffList.find((s) => s.name === name || s.displayName === name)?.displayName || name}
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b bg-muted/10">
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground w-24">날짜</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground">업무 내용</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-20">진행률</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground text-center w-24">승인상태</th>
                            <th className="px-5 py-2 text-[11px] font-bold text-muted-foreground w-32">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-b last:border-b-0 hover:bg-muted/5">
                              <td className="px-5 py-2 text-xs tabular-nums">{it.date}</td>
                              <td className="px-5 py-2">
                                <p className="text-sm text-foreground">{it.content || "-"}</p>
                                {it.managerComment && (
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">{it.managerComment}</p>
                                )}
                              </td>
                              <td className="px-5 py-2 text-center">
                                <span className="text-xs font-bold tabular-nums">{it.progress}%</span>
                              </td>
                              <td className="px-5 py-2 text-center">
                                <span
                                  className={cn(
                                    "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold",
                                    it.managerCheck === "승인" && "bg-success/10 text-success",
                                    it.managerCheck === "반려" && "bg-destructive/10 text-destructive",
                                    it.managerCheck === "대기" && "bg-warning/10 text-warning"
                                  )}
                                >
                                  {it.managerCheck}
                                </span>
                              </td>
                              <td className="px-5 py-2">
                                {it.managerCheck === "대기" && (
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[10px] text-success"
                                      onClick={() => handleApprove(it.id)}
                                      disabled={updating === it.id}
                                    >
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      승인
                                    </Button>
                                    {canReject && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[10px] text-destructive"
                                        onClick={() => handleReject(it.id)}
                                        disabled={updating === it.id}
                                      >
                                        <XCircle className="mr-1 h-3 w-3" />
                                        반려
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
