"use client"

import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { AdminEmployeeItem } from "@/lib/api-client"

function roleBadgeStyle(role: string): string {
  const r = String(role || "").trim()
  if (r === "Staff") return "bg-blue-600 text-white"
  if (r === "Manager") return "bg-orange-500 text-white"
  if (r === "Director") return "bg-black text-white"
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

export interface EmployeeTableRow extends AdminEmployeeItem {
  finalGrade?: string
}

interface EmployeeTableProps {
  rows: EmployeeTableRow[]
  loading?: boolean
  onEdit: (idx: number) => void
  onDelete: (rowId: number) => void
  t: (k: string) => string
}

export function EmployeeTable({ rows, loading, onEdit, onDelete, t }: EmployeeTableProps) {
  const { lang } = useLang()
  const ageSuffix = lang === "ko" ? "세" : ""
  const cols = [
    t("emp_label_store"),
    t("emp_grade"),
    t("emp_label_name"),
    t("emp_label_nickname"),
    t("emp_label_nation"),
    t("emp_col_age"),
    t("emp_label_role"),
    t("emp_col_salary"),
    t("emp_manage"),
  ]

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#1E293B] text-white">
            {cols.map((h, i) => (
              <th key={i} className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <tr>
              <td colSpan={9} className="py-12 text-center">{t("loading")}</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-12 text-center text-muted-foreground">{t("emp_result_empty")}</td>
            </tr>
          ) : (
            rows.map((e, idx) => {
              const age = e.birth
                ? `${new Date().getFullYear() - new Date(e.birth).getFullYear()}`
                : "-"
              const grade = e.finalGrade || "-"
              return (
                <tr key={e.row} className="hover:bg-primary/5 transition-colors">
                  <td className="px-3 py-2.5 text-center text-card-foreground">{e.store}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${gradeBadgeStyle(grade)}`}>
                      {grade}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold text-card-foreground">{e.name}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{e.nick || "-"}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{e.nation || "-"}</td>
                  <td className="px-3 py-2.5 text-center text-card-foreground">{age}{age !== "-" ? ageSuffix : ""}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${roleBadgeStyle(e.role)}`}>
                      {e.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-card-foreground">
                    {Number(e.salAmt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(idx)}
                        className="h-7 rounded bg-primary px-2 text-[10px] font-medium text-primary-foreground hover:opacity-90"
                      >
                        {t("emp_edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(e.row)}
                        className="h-7 rounded bg-destructive px-2 text-[10px] font-medium text-destructive-foreground hover:opacity-90"
                      >
                        {t("delete")}
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
  )
}
