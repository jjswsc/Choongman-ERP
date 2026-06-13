"use client"

import Link from "next/link"
import { CalendarClock, Pencil, Palmtree, Trash2, Wallet } from "lucide-react"
import { displayLabelShort } from "@/lib/utils"
import { formatEmployeeDisplayName } from "@/lib/employee-display-name"
import { getEmployeeJobOptionLabel } from "@/lib/employee-job-catalog"
import type { AdminEmployeeItem } from "@/lib/api-client"

function roleBadgeStyle(role: string): string {
  const r = String(role || "").trim().toLowerCase()
  if (r === "staff") return "bg-blue-600 text-white"
  if (r === "manager") return "bg-orange-500 text-white"
  if (r === "director") return "bg-black text-white"
  return "bg-gray-500 text-white"
}
function gradeBadgeStyle(g: string): string {
  const v = String(g || "-").trim().toUpperCase()
  if (v === "A" || v === "S") return "bg-[#1B5E20] text-white"
  if (v === "B") return "bg-[#0D47A1] text-white"
  if (v === "C") return "bg-[#F57F17] text-[#1a1a1a]"
  if (v === "D") return "bg-[#BF360C] text-white"
  if (v === "F" || v === "E") return "bg-[#3E2723] text-white"
  return "bg-gray-500 text-white"
}

function isManagerRoleBadge(role: string): boolean {
  return String(role || "")
    .trim()
    .toLowerCase()
    .includes("manager")
}

export interface EmployeeTableRow extends AdminEmployeeItem {
  finalGrade?: string
  /** 매니저 평가 유형 전용 — 등급 열에서 일반 등급과 나란히 표시 */
  managerGrade?: string
}

function bangkokTodayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** 입사일 기준 3개월 미만(방콕 날짜). 입사일 없음·미래 입사는 false */
function isJoinedWithin3Months(join: string, todayYmd: string): boolean {
  const joinDate = String(join || "").trim().slice(0, 10)
  if (!joinDate || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) return false
  if (joinDate > todayYmd) return false

  const [ty, tm, td] = todayYmd.split("-").map((x) => Number(x))
  let thresholdY = ty
  let thresholdM = tm - 3
  while (thresholdM <= 0) {
    thresholdM += 12
    thresholdY -= 1
  }
  const lastDay = new Date(thresholdY, thresholdM, 0).getDate()
  const thresholdD = Math.min(td, lastDay)
  const threshold = `${thresholdY}-${String(thresholdM).padStart(2, "0")}-${String(thresholdD).padStart(2, "0")}`

  return joinDate > threshold
}

function resolveRowStatus(e: AdminEmployeeItem): "active" | "leave" | "resigned" | "suspended" {
  const resignDate = String(e.resign || "").trim().slice(0, 10)
  const todayBangkok = bangkokTodayYmd()
  const raw = String((e as { employmentStatus?: unknown }).employmentStatus || "")
    .trim()
    .toLowerCase()
  if (raw === "active" || raw === "leave" || raw === "resigned" || raw === "suspended") {
    if (raw === "resigned" && resignDate && resignDate > todayBangkok) return "active"
    return raw
  }
  if (!resignDate) return "active"
  return resignDate <= todayBangkok ? "resigned" : "active"
}

function formatJoinDate(join: string): string {
  const d = String(join || "").trim().slice(0, 10)
  return d || "—"
}

function salTypeShort(salType: string, t: (k: string) => string): string {
  const s = String(salType || "").trim()
  if (s === "Monthly") return t("emp_sal_monthly")
  if (s === "Hourly") return t("emp_sal_hourly")
  if (s === "Part-time") return t("emp_sal_parttime")
  return s || "—"
}

function attendanceQuickHref(e: EmployeeTableRow): string {
  const q = new URLSearchParams({ tab: "status" })
  const store = String(e.store || "").trim()
  const name = String(e.name || e.nick || "").trim()
  if (store) q.set("store", store)
  if (name) q.set("employee", name)
  return `/admin/attendance?${q.toString()}`
}

interface EmployeeTableProps {
  rows: EmployeeTableRow[]
  loading?: boolean
  onEdit: (idx: number) => void
  onDelete: (rowId: number) => void
  t: (k: string) => string
  /** 전체 조회 시 퇴사일이 지난 경우에만 퇴사자 행 빨간색 표시 */
  statusFilter?: string
  /** 좌측 폼에서 편집 중인 직원 row id */
  selectedRowId?: number
}

export function EmployeeTable({
  rows,
  loading,
  onEdit,
  onDelete,
  t,
  statusFilter,
  selectedRowId = 0,
}: EmployeeTableProps) {
  const todayStr = bangkokTodayYmd()
  const hasNewHireRows = rows.some(
    (e) =>
      resolveRowStatus(e) !== "resigned" &&
      isJoinedWithin3Months(String(e.join || ""), todayStr)
  )

  const cols = [
    { key: "store", label: t("emp_label_store"), align: "left" as const },
    { key: "grade", label: t("emp_grade"), align: "center" as const },
    { key: "name", label: t("emp_label_name"), align: "left" as const },
    { key: "nick", label: t("emp_label_nickname"), align: "left" as const },
    { key: "code", label: t("emp_label_employee_code"), align: "left" as const },
    { key: "job", label: t("emp_label_job"), align: "left" as const },
    { key: "nation", label: t("emp_label_nation"), align: "left" as const },
    { key: "age", label: t("emp_col_age"), align: "right" as const },
    { key: "role", label: t("emp_label_role"), align: "center" as const },
    { key: "join", label: t("emp_label_join_date"), align: "center" as const },
    { key: "salary", label: t("emp_col_salary"), align: "right" as const },
    { key: "actions", label: t("emp_manage"), align: "center" as const },
  ]

  const thAlign = (a: "left" | "center" | "right") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left"

  return (
    <div className="space-y-1.5">
      <div className="overflow-auto rounded-lg border border-border bg-card max-h-[min(75vh,800px)]">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr className="border-b border-border">
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap ${thAlign(c.align)}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {loading ? (
              <tr>
                <td colSpan={cols.length} className="py-12 text-center text-sm">
                  {t("loading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="py-12 text-center text-sm text-muted-foreground">
                  {t("emp_result_empty")}
                </td>
              </tr>
            ) : (
              rows.map((e, idx) => {
                const age = e.birth
                  ? `${new Date().getFullYear() - new Date(e.birth).getFullYear()}`
                  : "—"
                const grade = e.finalGrade || "—"
                const managerGrade = String(e.managerGrade || "").trim()
                const isMgrRow = isManagerRoleBadge(e.role || "")
                const mgrEvalDisplay = managerGrade && managerGrade !== "-" ? managerGrade : "—"
                const resignStr = String(e.resign || "").trim()
                const resignDate = resignStr ? resignStr.slice(0, 10) : ""
                const status = resolveRowStatus(e)
                const isAfterResignDate = resignDate && todayStr > resignDate
                const showResignedHighlight =
                  (statusFilter === "" || statusFilter === "all") &&
                  (status === "resigned" || isAfterResignDate)
                const isSelected = selectedRowId > 0 && e.row === selectedRowId
                const isNewHire =
                  !showResignedHighlight && isJoinedWithin3Months(String(e.join || ""), todayStr)
                const salAmt = Number(e.salAmt)
                const salDisplay = salAmt > 0 ? salAmt.toLocaleString() : "—"
                const nick = displayLabelShort(e.nick) || "—"
                const zebra = idx % 2 === 1 ? "bg-muted/20" : "bg-card"

                return (
                  <tr
                    key={e.row}
                    onClick={() => onEdit(idx)}
                    title={isNewHire ? t("emp_row_new_hire_hint") : undefined}
                    className={`cursor-pointer transition-colors hover:bg-primary/8 ${zebra} ${
                      isNewHire ? "!bg-amber-50/80 hover:!bg-amber-100/70 dark:!bg-amber-950/20" : ""
                    } ${
                      isSelected ? "bg-primary/12 ring-1 ring-inset ring-primary/30" : ""
                    } ${showResignedHighlight ? "!bg-red-50 text-red-900 hover:!bg-red-100/90 dark:!bg-red-950/30 dark:text-red-200" : ""}`}
                  >
                    <td className="px-3 py-2.5 text-left font-medium text-card-foreground">{e.store || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <span
                          className={`inline-flex min-w-[1.25rem] items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${gradeBadgeStyle(grade)}`}
                        >
                          {grade}
                        </span>
                        {isMgrRow ? (
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${gradeBadgeStyle(mgrEvalDisplay)}`}
                            title={t("eval_type_manager_emp")}
                          >
                            {mgrEvalDisplay}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      <div className="font-semibold text-card-foreground">
                        {formatEmployeeDisplayName(e.name, e.nameTitle) || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-left text-muted-foreground">{nick}</td>
                    <td className="px-3 py-2.5 text-left font-mono text-xs text-card-foreground">
                      {String(e.employeeCode || "").trim() || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left text-card-foreground">
                      {getEmployeeJobOptionLabel(String(e.job || "").trim()) || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-left text-card-foreground">
                      {String(e.nation || "").trim() || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-card-foreground">{age}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${roleBadgeStyle(e.role)}`}
                      >
                        {displayLabelShort(e.role) || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                      {formatJoinDate(e.join)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="font-semibold tabular-nums text-card-foreground">{salDisplay}</div>
                      <div className="text-[11px] text-muted-foreground">{salTypeShort(e.salType, t)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <Link
                          href="/admin/payroll?tab=calc"
                          title={t("emp_quick_payroll")}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Wallet className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href="/admin/leave"
                          title={t("emp_quick_leave")}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Palmtree className="h-3.5 w-3.5" />
                        </Link>
                        <Link
                          href={attendanceQuickHref(e)}
                          title={t("emp_quick_attendance")}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => onEdit(idx)}
                          title={t("emp_edit")}
                          className="rounded-md p-1.5 text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(e.row)}
                          title={t("emp_status_resigned")}
                          className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && rows.length > 0 && hasNewHireRows ? (
        <p className="px-1 text-xs text-muted-foreground">{t("emp_list_new_hire_legend")}</p>
      ) : null}
    </div>
  )
}
