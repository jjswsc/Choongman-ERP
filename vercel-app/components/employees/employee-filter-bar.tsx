"use client"

import { Search, UserPlus } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getEmployeeJobOptionLabel } from "@/lib/employee-job-catalog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

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
  onNew?: () => void
}

const GRADES = ["S", "A", "B", "C", "F"]

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
  onNew,
}: EmployeeFilterBarProps) {
  const t = useT(useLang().lang)

  const selectCn =
    "h-9 text-sm border-border/80 bg-muted/35 shadow-sm hover:border-primary/35 focus:ring-2 focus:ring-primary/20"

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select
          value={storeFilter || "__all__"}
          onValueChange={(v) => onStoreFilterChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className={selectCn}>
            <SelectValue placeholder={t("stockFilterStoreAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("stockFilterStoreAll")}</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={jobFilter || "__all__"}
          onValueChange={(v) => onJobFilterChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className={selectCn}>
            <SelectValue placeholder={t("emp_job_all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("emp_job_all")}</SelectItem>
            {jobOptions.map((j) => (
              <SelectItem key={j} value={j}>
                {getEmployeeJobOptionLabel(j)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={gradeFilter || "__all__"}
          onValueChange={(v) => onGradeFilterChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className={selectCn}>
            <SelectValue placeholder={t("emp_grade_all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("emp_grade_all")}</SelectItem>
            {GRADES.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => onStatusFilterChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className={selectCn}>
            <SelectValue placeholder={t("emp_status_all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("emp_status_all")}</SelectItem>
            <SelectItem value="active">{t("emp_status_active")}</SelectItem>
            <SelectItem value="leave">{t("emp_status_leave")}</SelectItem>
            <SelectItem value="suspended">{t("emp_status_suspended")}</SelectItem>
            <SelectItem value="resigned">{t("emp_status_resigned")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onNew ? (
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-3 text-sm font-semibold"
            onClick={onNew}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("emp_new")}
          </Button>
        ) : null}
        <div className="relative min-w-[120px] flex-1">
          <Input
            type="text"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
            placeholder={t("search")}
            className="h-9 pr-8 text-sm border-border/80 bg-muted/35 shadow-sm"
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          <Search className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button type="button" size="sm" className="h-9 shrink-0 px-5 text-sm font-semibold" onClick={onSearch}>
          {t("stockBtnSearch")}
        </Button>
      </div>
    </div>
  )
}
