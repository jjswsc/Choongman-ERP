"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { getEmployeeInputAudit, type EmployeeInputAuditRow } from "@/lib/api-client"
import { EMPLOYEE_AUDIT_FIELD_I18N } from "@/lib/employee-audit"
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

export function EmployeeInputHistoryTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const todayBkk = React.useMemo(() => getBangkokTodayDateString(), [])

  const [auditRows, setAuditRows] = React.useState<EmployeeInputAuditRow[]>([])
  const [auditLoading, setAuditLoading] = React.useState(false)
  const [auditQueried, setAuditQueried] = React.useState(false)
  const [auditSearchTerm, setAuditSearchTerm] = React.useState("")
  const [auditActionFilter, setAuditActionFilter] = React.useState<"all" | "insert" | "update" | "delete">("all")
  const [auditActorFilter, setAuditActorFilter] = React.useState("all")
  const [auditDatePreset, setAuditDatePreset] = React.useState<"today" | "7d" | "30d" | "custom">("today")
  const [auditStartDate, setAuditStartDate] = React.useState(todayBkk)
  const [auditEndDate, setAuditEndDate] = React.useState(todayBkk)
  const [expandedId, setExpandedId] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!todayBkk) return
    if (auditDatePreset === "today") {
      setAuditStartDate(todayBkk)
      setAuditEndDate(todayBkk)
      return
    }
    if (auditDatePreset === "7d") {
      setAuditStartDate(addBangkokCalendarDays(todayBkk, -6))
      setAuditEndDate(todayBkk)
      return
    }
    if (auditDatePreset === "30d") {
      setAuditStartDate(addBangkokCalendarDays(todayBkk, -29))
      setAuditEndDate(todayBkk)
    }
  }, [auditDatePreset, todayBkk])

  const fieldLabel = React.useCallback(
    (field: string) => {
      const key = EMPLOYEE_AUDIT_FIELD_I18N[field]
      return key ? t(key) : field
    },
    [t]
  )

  const formatChangeSummary = React.useCallback(
    (row: EmployeeInputAuditRow) => {
      if (row.actionType === "insert") return t("emp_audit_summary_insert")
      if (row.actionType === "delete") return t("emp_audit_summary_delete")
      if (row.changeCount <= 0) return t("emp_audit_summary_no_diff")
      const changes = Array.isArray(row.changes) ? row.changes : []
      const names = changes.slice(0, 3).map((c) => fieldLabel(c.field))
      const rest = (row.changeCount || changes.length) - names.length
      if (rest > 0) return `${names.join(", ")} ${t("emp_audit_summary_more").replace("{n}", String(rest))}`
      return names.join(", ")
    },
    [fieldLabel, t]
  )

  const loadAudit = React.useCallback(async () => {
    setAuditLoading(true)
    try {
      const rows = await getEmployeeInputAudit({
        limit: 1000,
        startDate: auditStartDate || undefined,
        endDate: auditEndDate || undefined,
      })
      setAuditRows(Array.isArray(rows) ? rows : [])
      setAuditQueried(true)
      setExpandedId(null)
    } catch {
      setAuditRows([])
      setAuditQueried(false)
    } finally {
      setAuditLoading(false)
    }
  }, [auditEndDate, auditStartDate])

  const filteredAuditRows = React.useMemo(() => {
    const q = auditSearchTerm.trim().toLowerCase()
    return auditRows.filter((r) => {
      const matchAction = auditActionFilter === "all" || r.actionType === auditActionFilter
      const actorKey = String(r.actorName || "").trim() || "-"
      const matchActor = auditActorFilter === "all" || actorKey === auditActorFilter
      if (!matchAction || !matchActor) return false
      if (!q) return true
      const hay = [
        r.employeeName,
        r.employeeCode,
        r.employeeStore,
        r.actorName,
        r.actorStore,
        r.actorRole,
        r.changeReason,
        ...(Array.isArray(r.changes) ? r.changes : []).flatMap((c) => [c.field, c.oldValue, c.newValue]),
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ")
      const terms = q.split(/\s+/).filter(Boolean)
      return terms.every((term) => hay.includes(term))
    })
  }, [auditRows, auditSearchTerm, auditActionFilter, auditActorFilter])

  const auditActorOptions = React.useMemo(() => {
    const names = Array.from(
      new Set(
        auditRows
          .map((r) => String(r.actorName || "").trim() || "-")
          .filter(Boolean)
      )
    )
    return names.sort((a, b) => a.localeCompare(b, "ko"))
  }, [auditRows])

  const actionLabel = (actionType: string) => {
    if (actionType === "insert") return t("create")
    if (actionType === "update") return t("edit")
    if (actionType === "delete") return t("emp_audit_action_deactivate")
    return actionType
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("emp_audit_bangkok_hint")}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={auditDatePreset}
          onValueChange={(v) => {
            setAuditDatePreset(v as "today" | "7d" | "30d" | "custom")
            setAuditQueried(false)
          }}
        >
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder={t("date")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("today")}</SelectItem>
            <SelectItem value="7d">{t("last7Days")}</SelectItem>
            <SelectItem value="30d">{t("last30Days")}</SelectItem>
            <SelectItem value="custom">{t("custom")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={auditStartDate}
          onChange={(e) => {
            setAuditDatePreset("custom")
            setAuditStartDate(e.target.value)
            setAuditQueried(false)
          }}
          className="h-9 w-40 text-xs"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <Input
          type="date"
          value={auditEndDate}
          onChange={(e) => {
            setAuditDatePreset("custom")
            setAuditEndDate(e.target.value)
            setAuditQueried(false)
          }}
          className="h-9 w-40 text-xs"
        />
        <Select
          value={auditActionFilter}
          onValueChange={(v) => setAuditActionFilter(v as "all" | "insert" | "update" | "delete")}
        >
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="insert">{t("create")}</SelectItem>
            <SelectItem value="update">{t("edit")}</SelectItem>
            <SelectItem value="delete">{t("delete")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={auditActorFilter} onValueChange={setAuditActorFilter}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder={t("manager")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            {auditActorOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={auditSearchTerm}
            onChange={(e) => setAuditSearchTerm(e.target.value)}
            placeholder={t("emp_audit_search_ph")}
            className="h-9 pl-9 pr-9 text-sm"
          />
          {auditSearchTerm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setAuditSearchTerm("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button
          size="sm"
          className="h-9 gap-1.5 px-4 text-xs font-semibold"
          onClick={() => void loadAudit()}
          disabled={auditLoading}
        >
          <Search className={cn("h-3.5 w-3.5", auditLoading && "animate-pulse")} />
          {auditLoading ? t("loading") : t("search")}
        </Button>
      </div>

      {auditLoading ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : !auditQueried ? (
        <div className="rounded-xl border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("emp_audit_hint")}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("dateTime")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("emp_label_store")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("emp_label_name")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("status")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("emp_audit_col_changes")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("manager")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditRows.map((r) => {
                  const open = expandedId === r.id
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        className="border-b last:border-b-0 cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedId(open ? null : r.id)}
                      >
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">{r.changedAt || "-"}</td>
                        <td className="px-3 py-2 text-xs">{r.employeeStore || "-"}</td>
                        <td className="px-3 py-2 text-xs">
                          <div>{r.employeeName || "-"}</div>
                          {r.employeeCode && (
                            <div className="font-mono text-muted-foreground">{r.employeeCode}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{actionLabel(r.actionType)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatChangeSummary(r)}</td>
                        <td className="px-3 py-2 text-xs">
                          <div>{r.actorName || "-"}</div>
                          <div className="text-muted-foreground">
                            {[r.actorRole, r.actorStore, r.actorEmployeeCode].filter(Boolean).join(" · ") || "-"}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={6} className="px-3 py-3">
                            {r.changeReason && (
                              <p className="mb-2 text-xs text-muted-foreground">
                                {t("emp_audit_change_reason")}: {r.changeReason}
                              </p>
                            )}
                            {(() => {
                              const changes = Array.isArray(r.changes) ? r.changes : []
                              if (changes.length === 0) {
                                return (
                                  <p className="text-xs text-muted-foreground">{t("emp_audit_summary_no_diff")}</p>
                                )
                              }
                              const isInsert = r.actionType === "insert"
                              return (
                              <div className="overflow-x-auto rounded-md border bg-background">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-muted/40">
                                      <th className="px-2 py-1.5 text-left font-semibold">{t("emp_audit_col_field")}</th>
                                      {!isInsert && (
                                        <th className="px-2 py-1.5 text-left font-semibold">{t("emp_audit_col_before")}</th>
                                      )}
                                      <th className="px-2 py-1.5 text-left font-semibold">
                                        {isInsert ? t("emp_audit_col_registered") : t("emp_audit_col_after")}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {changes.map((c) => (
                                      <tr key={`${r.id}-${c.field}`} className="border-b last:border-b-0">
                                        <td className="px-2 py-1.5 whitespace-nowrap">{fieldLabel(c.field)}</td>
                                        {!isInsert && (
                                          <td className="px-2 py-1.5 break-all text-muted-foreground">
                                            {c.oldValue || "—"}
                                          </td>
                                        )}
                                        <td className="px-2 py-1.5 break-all">{c.newValue || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              )
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredAuditRows.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("emp_audit_no_data")}</div>
          )}
        </div>
      )}
    </div>
  )
}
