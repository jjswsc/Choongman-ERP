"use client"

import { useState, useEffect } from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BarChart3, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useStoreList, getLeaveStats } from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { hasOfficeStaffScope } from "@/lib/permissions"
import type { LeaveStatsStaffFilter } from "@/lib/leave-request-utils"

function todayStr() {
  return getBangkokTodayDateString()
}

export function AdminLeaveStats() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [startStr, setStartStr] = useState(todayStr())
  const [endStr, setEndStr] = useState(todayStr())
  const [storeFilter, setStoreFilter] = useState("All")
  const [staffFilter, setStaffFilter] = useState<LeaveStatsStaffFilter>("active")
  const [nameQuery, setNameQuery] = useState("")
  const [stores, setStores] = useState<string[]>([])
  const [statsList, setStatsList] = useState<
    {
      store: string
      name: string
      employeeCode: string
      resigned?: boolean
      usedPeriodAnnual: number
      usedPeriodSick: number
      usedPeriodUnpaid: number
      usedPeriodLakij: number
      usedTotalAnnual: number
      usedTotalSick: number
      usedTotalUnpaid: number
      usedTotalLakij: number
      remain: number
      remainLakij: number
      remainSick: number
    }[]
  >([])
  const [loading, setLoading] = useState(false)

  const { posStores: storeKeys } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    const isOffice = hasOfficeStaffScope(auth.role || "", auth.store)
    queueMicrotask(() => {
      if (isOffice) {
        setStores(["All", ...storeKeys.filter((s) => s !== "All")])
      } else {
        setStores([auth.store!])
        setStoreFilter(auth.store)
      }
    })
  }, [auth?.store, auth?.role, storeKeys])

  const loadStats = () => {
    if (!auth?.store) return
    setLoading(true)
    getLeaveStats({
      startStr,
      endStr,
      store: storeFilter === "All" ? undefined : storeFilter,
      staffFilter,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setStatsList)
      .catch(() => setStatsList([]))
      .finally(() => setLoading(false))
  }

  const nameQ = nameQuery.trim().toLowerCase()
  const visibleStats = !nameQ
    ? statsList
    : statsList.filter((r) => {
        const name = String(r.name || "").toLowerCase()
        const code = String(r.employeeCode || "").toLowerCase()
        return name.includes(nameQ) || code.includes(nameQ)
      })

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">{t("leave_tab_stats")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="h-9 w-full text-xs" />
          <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="h-9 w-full text-xs" />
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={staffFilter} onValueChange={(v) => setStaffFilter(v as LeaveStatsStaffFilter)}>
            <SelectTrigger className="h-9 w-full text-xs" aria-label={t("leave_stats_staff_filter")}>
              <span className="truncate text-muted-foreground">{t("leave_stats_staff_filter")}</span>
              <SelectValue placeholder={t("emp_status_active")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("emp_status_active")}</SelectItem>
              <SelectItem value="resigned">{t("emp_status_resigned")}</SelectItem>
              <SelectItem value="all">{t("emp_status_all")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadStats()
          }}
          placeholder={t("leave_stats_name_ph")}
          className="h-9 w-full text-xs"
          aria-label={t("leave_stats_name_ph")}
        />
        <Button className="h-10 w-full font-medium" onClick={loadStats} disabled={loading}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
        <p className="text-[11px] leading-snug text-muted-foreground px-0.5">{t("leave_stats_approved_only")}</p>
        <AdminTableScroll className="rounded-lg border border-border" hint={false}>
          <table className="w-full text-xs text-center">
            <thead>
              <tr className="border-b bg-muted/50">
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">{t("store")}</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle">{t("leave_col_name")}</th>
                <th rowSpan={2} className="px-3 py-2.5 font-semibold align-middle whitespace-nowrap tabular-nums">
                  {t("emp_label_employee_code")}
                </th>
                <th colSpan={4} className="px-3 py-2 font-semibold">{t("leave_used_period")}</th>
                <th colSpan={4} className="px-3 py-2 font-semibold">{t("leave_used_total")}</th>
                <th colSpan={3} className="px-3 py-2 font-semibold">{t("leave_remain")}</th>
              </tr>
              <tr className="border-b bg-muted/30">
                <th className="px-2 py-1 font-medium">{t("annual")}</th>
                <th className="px-2 py-1 font-medium">{t("lakij")}</th>
                <th className="px-2 py-1 font-medium">{t("sick")}</th>
                <th className="px-2 py-1 font-medium">{t("unpaid")}</th>
                <th className="px-2 py-1 font-medium">{t("annual")}</th>
                <th className="px-2 py-1 font-medium">{t("lakij")}</th>
                <th className="px-2 py-1 font-medium">{t("sick")}</th>
                <th className="px-2 py-1 font-medium">{t("unpaid")}</th>
                <th className="px-2 py-1 font-medium">{t("annual")}</th>
                <th className="px-2 py-1 font-medium">{t("lakij")}</th>
                <th className="px-2 py-1 font-medium">{t("sick")}</th>
              </tr>
            </thead>
            <tbody>
              {statsList.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-muted-foreground">
                    {t("leave_stats_hint")}
                  </td>
                </tr>
              ) : visibleStats.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-8 text-center text-muted-foreground">
                    {t("outNoData")}
                  </td>
                </tr>
              ) : (
                visibleStats.map((r, i) => (
                  <tr key={`${r.store}-${r.name}-${i}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.store}</td>
                    <td className="px-3 py-2.5 font-medium">
                      {r.name}
                      {r.resigned ? (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          ({t("emp_status_resigned")})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-medium tabular-nums whitespace-nowrap">{r.employeeCode || "-"}</td>
                    <td className="px-2 py-2.5">{r.usedPeriodAnnual}</td>
                    <td className="px-2 py-2.5">{r.usedPeriodLakij ?? 0}</td>
                    <td className="px-2 py-2.5">{r.usedPeriodSick}</td>
                    <td className="px-2 py-2.5">{r.usedPeriodUnpaid}</td>
                    <td className="px-2 py-2.5">{r.usedTotalAnnual}</td>
                    <td className="px-2 py-2.5">{r.usedTotalLakij ?? 0}</td>
                    <td className="px-2 py-2.5">{r.usedTotalSick}</td>
                    <td className="px-2 py-2.5">{r.usedTotalUnpaid}</td>
                    <td className="px-3 py-2.5 font-bold text-primary">{r.remain}</td>
                    <td className="px-3 py-2.5 font-bold text-primary">{r.remainLakij ?? 3}</td>
                    <td className="px-3 py-2.5 font-bold text-primary">{r.remainSick ?? 30}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </AdminTableScroll>
      </CardContent>
    </Card>
  )
}
