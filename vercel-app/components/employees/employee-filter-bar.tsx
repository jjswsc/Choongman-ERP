"use client"

import { Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

interface EmployeeFilterBarProps {
  stores: string[]
  storeFilter: string
  onStoreFilterChange: (v: string) => void
  jobOptions: string[]
  jobFilter: string
  onJobFilterChange: (v: string) => void
  gradeFilter: string
  onGradeFilterChange: (v: string) => void
  statusFilter: string
  onStatusFilterChange: (v: string) => void
  searchText: string
  onSearchTextChange: (v: string) => void
  onSearch: () => void
}

const GRADES = ["All", "S", "A", "B", "C", "F"]

export function EmployeeFilterBar({
  stores,
  storeFilter,
  onStoreFilterChange,
  jobOptions,
  jobFilter,
  onJobFilterChange,
  gradeFilter,
  onGradeFilterChange,
  statusFilter,
  onStatusFilterChange,
  searchText,
  onSearchTextChange,
  onSearch,
}: EmployeeFilterBarProps) {
  const t = useT(useLang().lang)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={storeFilter || "All"}
        onChange={(e) => onStoreFilterChange(e.target.value === "All" ? "" : e.target.value)}
        className="h-8 rounded border border-input bg-card px-2 pr-8 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer max-w-[150px]"
      >
        <option value="All">{t("stockFilterStoreAll")}</option>
        {stores.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        value={jobFilter || "All"}
        onChange={(e) => onJobFilterChange(e.target.value === "All" ? "" : e.target.value)}
        className="h-8 rounded border border-input bg-card px-2 pr-8 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer max-w-[140px]"
      >
        <option value="All">{t("emp_job_all")}</option>
        {jobOptions.map((j) => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>
      <select
        value={gradeFilter || "All"}
        onChange={(e) => onGradeFilterChange(e.target.value === "All" ? "" : e.target.value)}
        className="h-8 rounded border border-input bg-card px-2 pr-8 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer max-w-[120px]"
      >
        <option value="All">{t("emp_grade_all")}</option>
        {GRADES.filter((g) => g !== "All").map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
      <select
        value={statusFilter || "all"}
        onChange={(e) => onStatusFilterChange(e.target.value === "all" ? "" : e.target.value)}
        className="h-8 rounded border border-input bg-card px-2 pr-8 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer max-w-[120px]"
      >
        <option value="all">{t("emp_status_all")}</option>
        <option value="active">{t("emp_status_active")}</option>
        <option value="resigned">{t("emp_status_resigned")}</option>
      </select>
      <div className="relative flex-1 min-w-[120px] max-w-[200px]">
        <input
          type="text"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          placeholder={t("search")}
          className="h-8 w-full rounded border border-input bg-card pl-2 pr-8 text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="h-8 rounded bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-colors shadow-sm"
      >
        {t("stockBtnSearch")}
      </button>
    </div>
  )
}
