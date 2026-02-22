"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { getIncomeStatement } from "@/lib/api-client"

export function IncomeStatementTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const [yearMonth, setYearMonth] = React.useState(() => {
    const n = new Date()
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0")
  })
  const [storeFilter, setStoreFilter] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )
  const [data, setData] = React.useState<{
    sales: number
    purchases: number
    expenses: number
    grossProfit: number
    netProfit: number
    yearMonth?: string
    storeFilter?: string
  } | null>(null)
  const [loading, setLoading] = React.useState(false)

  // 매니저: storeFilter 고정
  React.useEffect(() => {
    if (isManager && managerStore) {
      setStoreFilter(managerStore)
    }
  }, [isManager, managerStore])

  const loadData = React.useCallback(() => {
    setLoading(true)
    getIncomeStatement({
      yearMonth,
      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then((r) => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [yearMonth, storeFilter, auth?.store, auth?.role])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const yearMonthOptions = Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return { value: `${y}-${String(m).padStart(2, "0")}`, label: `${y}년 ${m}월` }
  })

  // Office: 본사 + 매장 목록. 매니저: 자기 매장만
  const storeOptions = isOffice
    ? ["본사", ...(storeList || []).filter((s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office"))]
    : isManager && managerStore
      ? [managerStore]
      : []

  const formatBath = (n: number) => `฿${(n ?? 0).toLocaleString()}`
  const storeLabel =
    storeFilter === "All"
      ? t("all") || "전체"
      : ["본사", "Office", "오피스", "본점"].includes(storeFilter) || storeFilter.toLowerCase().includes("office")
        ? t("pettyScopeOffice") || "본사"
        : storeFilter

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={yearMonth} onValueChange={setYearMonth}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder={t("pL_month")} />
              </SelectTrigger>
              <SelectContent>
                {yearMonthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(isOffice || isManager) && (
              <Select
                value={storeFilter}
                onValueChange={setStoreFilter}
                disabled={isManager || !storeOptions.length}
              >
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder={t("pL_store")} />
                </SelectTrigger>
                <SelectContent>
                  {isOffice && <SelectItem value="All">{t("all") || "전체"}</SelectItem>}
                  {storeOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={loadData} disabled={loading}>
              <Search className="h-4 w-4 mr-1" />
              {t("btn_query")}
            </Button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("loadingItems") || "불러오는 중..."}
            </p>
          ) : data ? (
            <div className="overflow-x-auto">
              <div className="text-sm text-muted-foreground mb-2">
                {data.yearMonth} · {storeLabel}
              </div>
              <table className="w-full max-w-md text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 font-medium">{t("pL_sales")}</td>
                    <td className="py-2 text-right font-mono">{formatBath(data.sales)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-muted-foreground">- {t("pL_purchases")}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {formatBath(data.purchases)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 font-medium text-primary">{t("pL_grossProfit")}</td>
                    <td className="py-2 text-right font-mono font-medium text-primary">
                      {formatBath(data.grossProfit)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2 text-muted-foreground">- {t("pL_expenses")}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {formatBath(data.expenses)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-bold">{t("pL_netProfit")}</td>
                    <td
                      className={`py-3 text-right font-mono font-bold ${
                        data.netProfit >= 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {formatBath(data.netProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("msg_select_date") || "날짜를 선택해 주세요."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
