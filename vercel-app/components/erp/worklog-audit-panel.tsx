"use client"

import * as React from "react"
import { CalendarIcon, Search, Building2, User, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getWorkLogAudit,
  getWorkLogOfficeOptions,
  type WorkLogAuditItem,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { formatWorkLogStaffSelectLabel } from "@/lib/work-log-name"

type WorkLogStaffOpt = { id: number; name: string; displayName: string; store?: string }

const ACTION_KEYS: Record<string, string> = {
  save: "workLogAuditActionSave",
  close: "workLogAuditActionClose",
  review: "workLogAuditActionReview",
  priority: "workLogAuditActionPriority",
  delete: "workLogAuditActionDelete",
}

export function WorklogAuditPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const today = getBangkokTodayDateString()
  const [startStr, setStartStr] = React.useState(today)
  const [endStr, setEndStr] = React.useState(today)
  const [employeeFilter, setEmployeeFilter] = React.useState("all")
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [staffList, setStaffList] = React.useState<WorkLogStaffOpt[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [items, setItems] = React.useState<WorkLogAuditItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [forbidden, setForbidden] = React.useState(false)

  React.useEffect(() => {
    getWorkLogOfficeOptions("office").then((r) => {
      setStaffList((r.staff || []) as WorkLogStaffOpt[])
      setStores(r.stores || [])
    })
  }, [])

  const staffOptions = React.useMemo(
    () =>
      staffList
        .filter((s) => storeFilter === "all" || s.store === storeFilter)
        .map((s) => ({ ...s, label: formatWorkLogStaffSelectLabel(s) })),
    [staffList, storeFilter]
  )

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setForbidden(false)
    try {
      const { items: res, forbidden: denied } = await getWorkLogAudit({
        startStr,
        endStr,
        employeeId: employeeFilter !== "all" ? employeeFilter : undefined,
        store: storeFilter !== "all" ? storeFilter : undefined,
        limit: 150,
      })
      setForbidden(denied)
      setItems(res)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, employeeFilter, storeFilter])

  const handleSearch = () => {
    setHasSearched(true)
    void loadData()
  }

  React.useEffect(() => {
    setHasSearched(true)
    void loadData()
  }, [loadData])

  const actionLabel = (type?: string) => {
    const key = type ? ACTION_KEYS[type] : undefined
    return key ? t(key) : type || "-"
  }

  const formatTime = (iso?: string) => {
    if (!iso) return "-"
    try {
      return new Date(iso).toLocaleString("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    } catch {
      return iso.slice(0, 16)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarIcon className="h-3.5 w-3.5 text-primary" />
              {t("workLogPeriod")}
            </label>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => {
                  setStartStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
              <span className="text-xs text-muted-foreground shrink-0">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => {
                  setEndStr(e.target.value)
                  setHasSearched(false)
                }}
                className="h-9 w-32 text-xs shrink-0"
              />
            </div>
          </div>
          {stores.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                {t("workLogStore")}
              </label>
              <Select
                value={storeFilter}
                onValueChange={(v) => {
                  setStoreFilter(v)
                  setEmployeeFilter("all")
                  setHasSearched(false)
                }}
              >
                <SelectTrigger className="h-9 w-32 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-primary" />
              {t("workLogEmployee")}
            </label>
            <Select
              value={employeeFilter}
              onValueChange={(v) => {
                setEmployeeFilter(v)
                setHasSearched(false)
              }}
            >
              <SelectTrigger className="h-9 w-36 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all")}</SelectItem>
                {staffOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleSearch} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {t("workLogSearch")}
          </Button>
        </div>
      </div>

      {forbidden && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-warning">
          {t("workLogAuditForbidden")}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : hasSearched && items.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
          {t("workLogNoAuditData")}
        </div>
      ) : (
        hasSearched && (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2.5 font-semibold">{t("workLogAuditColTime")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogAuditColAction")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogColEmployee")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogStore")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogColDate")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogAuditColActor")}</th>
                  <th className="px-3 py-2.5 font-semibold">{t("workLogAuditColReason")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id ?? `${it.changed_at}-${it.work_log_id}`} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatTime(it.changed_at)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <History className="h-3 w-3 text-muted-foreground" />
                        {actionLabel(it.action_type)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{it.employee_name || "-"}</td>
                    <td className="px-3 py-2">{it.employee_store || "-"}</td>
                    <td className="px-3 py-2 tabular-nums">{String(it.log_date || "").slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      {it.actor_name || "-"}
                      {it.actor_role ? (
                        <span className="ml-1 text-muted-foreground">({it.actor_role})</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={it.change_reason || ""}>
                      {it.change_reason || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
