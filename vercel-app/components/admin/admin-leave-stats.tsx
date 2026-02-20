"use client"

import { useState, useEffect } from "react"
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

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function firstDayOfMonth(d?: Date): string {
  const x = d || new Date()
  return x.toISOString().slice(0, 7) + "-01"
}

function lastDayOfMonth(d?: Date): string {
  const x = d || new Date()
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0)
  return last.toISOString().slice(0, 10)
}

export function AdminLeaveStats() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [startStr, setStartStr] = useState(todayStr())
  const [endStr, setEndStr] = useState(todayStr())
  const [storeFilter, setStoreFilter] = useState("All")
  const [stores, setStores] = useState<string[]>([])
  const [statsList, setStatsList] = useState<{ store: string; name: string; usedPeriodAnnual: number; usedPeriodSick: number; usedPeriodUnpaid: number; usedPeriodLakij: number; usedTotalAnnual: number; usedTotalSick: number; usedTotalUnpaid: number; usedTotalLakij: number; remain: number; remainLakij: number }[]>([])
  const [loading, setLoading] = useState(false)

  const { stores: storeKeys } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === 'director' || auth.role === 'officer' || auth.role === 'ceo' || auth.role === 'hr'
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
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setStatsList)
      .catch(() => setStatsList([]))
      .finally(() => setLoading(false))
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">{t("leave_tab_stats")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="h-9 flex-1 text-xs" />
          <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="h-9 flex-1 text-xs" />
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-9 flex-1 text-xs">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="h-10 w-full font-medium" onClick={loadStats} disabled={loading}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {loading ? t("loading") : t("search")}
        </Button>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-center">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2.5 font-semibold">{t("store")}</th>
                <th className="px-3 py-2.5 font-semibold">{t("leave_col_name")}</th>
                <th colSpan={4} className="px-3 py-2 font-semibold">{t("leave_used_period")}</th>
                <th colSpan={4} className="px-3 py-2 font-semibold">{t("leave_used_total")}</th>
                <th colSpan={2} className="px-3 py-2 font-semibold">{t("leave_remain")}</th>
              </tr>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-1" />
                <th className="px-3 py-1" />
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
              </tr>
            </thead>
            <tbody>
              {statsList.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-muted-foreground">
                    {t("leave_stats_hint")}
                  </td>
                </tr>
              ) : (
                statsList.map((r, i) => (
                  <tr key={`${r.store}-${r.name}-${i}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2.5 font-medium">{r.store}</td>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
