"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import { buildPayrollStoreSelectOptions } from "@/lib/office-payroll-access"
import { useSyncOfficePayrollAccess } from "@/lib/use-office-payroll-access"
import { apiFetch, useStoreList } from "@/lib/api-client"

type SalaryHistoryRow = {
  id: number
  employee_id: number
  store: string
  name: string
  old_sal_type: string
  new_sal_type: string
  old_sal_amt: number
  new_sal_amt: number
  old_position_allowance: number
  new_position_allowance: number
  old_haz_allow: number
  new_haz_allow: number
  changed_at: string
  changed_by: string
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatDateTime(iso: string): string {
  if (!iso) return "-"
  try {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function AdminPayrollSalaryHistory() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()
  useSyncOfficePayrollAccess()

  const [storeFilter, setStoreFilter] = useState(isManager && userStore ? userStore : "All")
  const [nameFilter, setNameFilter] = useState("")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [stores, setStores] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<SalaryHistoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)

  const { posStores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    setStores(
      buildPayrollStoreSelectOptions(storeList, {
        role: auth?.role || "",
        canManageOfficePayroll: auth?.canManageOfficePayroll,
        store: auth?.store || "",
      })
    )
  }, [auth?.store, auth?.role, auth?.canManageOfficePayroll, storeList])

  useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

  const handleQuery = async () => {
    setLoading(true)
    setError(null)
    try {
      const effectiveStore = isManager && userStore ? userStore : (storeFilter === "All" ? "" : storeFilter)
      const params = new URLSearchParams()
      if (effectiveStore) params.set("storeFilter", effectiveStore)
      if (nameFilter.trim()) params.set("nameFilter", nameFilter.trim())
      if (fromDate) params.set("fromDate", fromDate)
      if (toDate) params.set("toDate", toDate)

      const res = await apiFetch(`/api/getEmployeeSalaryHistory?${params}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.list)) {
        setList(data.list)
      } else {
        setList([])
        setError(data.msg || t("pay_error"))
      }
    } catch {
      setList([])
      setError(t("pay_error"))
    } finally {
      setLoading(false)
      setQueried(true)
    }
  }

  const hasResult = list.length > 0

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          {!isManager && (
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-semibold block mb-1">{t("pay_hist_store")}</label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("store")} />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((st) => (
                    <SelectItem key={st} value={st}>{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-semibold block mb-1">{t("pay_col_name")}</label>
            <Input
              type="text"
              placeholder={t("pay_col_name")}
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-semibold block mb-1">{t("pay_sal_hist_from")}</label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-semibold block mb-1">{t("pay_sal_hist_to") || "종료일"}</label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <Button
            className="h-9 font-medium"
            onClick={handleQuery}
            disabled={loading}
          >
            {loading ? t("loading") : t("btn_query_go")}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {hasResult && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-left font-medium">{t("pay_sal_hist_changed_at")}</th>
                  <th className="p-2 text-left font-medium">{t("pay_col_store")}</th>
                  <th className="p-2 text-left font-medium">{t("pay_col_name")}</th>
                  <th className="p-2 text-left font-medium">{t("emp_label_sal_type")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_col_base")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_pos_allow")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_haz_allow")}</th>
                  <th className="p-2 text-left font-medium">{t("pay_sal_hist_changed_by")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="p-2 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.changed_at)}
                    </td>
                    <td className="p-2 font-medium">{r.store}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">
                      <span className="text-muted-foreground">{r.old_sal_type || "-"}</span>
                      <span className="mx-1">→</span>
                      <span>{r.new_sal_type || "-"}</span>
                    </td>
                    <td className="p-2 text-right">
                      <span className="text-muted-foreground">{fmt(r.old_sal_amt)}</span>
                      <span className="mx-1">→</span>
                      <span className="font-medium">{fmt(r.new_sal_amt)}</span>
                    </td>
                    <td className="p-2 text-right">
                      <span className="text-muted-foreground">{fmt(r.old_position_allowance)}</span>
                      <span className="mx-1">→</span>
                      <span>{fmt(r.new_position_allowance)}</span>
                    </td>
                    <td className="p-2 text-right">
                      <span className="text-muted-foreground">{fmt(r.old_haz_allow)}</span>
                      <span className="mx-1">→</span>
                      <span>{fmt(r.new_haz_allow)}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">{r.changed_by || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!queried && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            {t("pay_hist_query_please")}
          </div>
        )}

        {queried && !hasResult && !error && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {t("pay_hist_no_data")}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
