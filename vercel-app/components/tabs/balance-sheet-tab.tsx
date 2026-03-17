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
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { useStoreList, getBalanceSheet, translateTexts, type BalanceSheetData } from "@/lib/api-client"

export function BalanceSheetTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores: storeList } = useStoreList()
  const isOffice = isOfficeRole(auth?.role || "")
  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const [yearMonth, setYearMonth] = React.useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
  })
  const [storeFilter, setStoreFilter] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<BalanceSheetData | null>(null)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})

  const withdrawals = data?.unpostedBankWithdrawals || []
  React.useEffect(() => {
    const memos = [...new Set(withdrawals.map((row) => (row.memo || row.store || "").trim()).filter(Boolean))]
    if (memos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(memos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        memos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => { cancelled = true }
  }, [data?.unpostedBankWithdrawals, lang])

  const getMemo = React.useCallback((memo: string | undefined | null, store?: string | null) => {
    const raw = (memo || store || "").trim() || "—"
    if (raw === "—") return "—"
    return (memoTransMap[raw] || memoTransMap[store || ""]) || raw
  }, [memoTransMap])

  React.useEffect(() => {
    if (isManager && managerStore) setStoreFilter(managerStore)
  }, [isManager, managerStore])

  const loadData = React.useCallback(() => {
    setLoading(true)
    getBalanceSheet({
      yearMonth,
      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
      userStore: auth?.store,
      userRole: auth?.role,
    })
      .then((r) => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [yearMonth, storeFilter, auth?.store, auth?.role])

  const yearMonthOptions = Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return { value: `${y}-${String(m).padStart(2, "0")}`, label: `${y}년 ${m}월` }
  })

  const storeOptions = isOffice
    ? ["본사", ...(storeList || []).filter((s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office"))]
    : isManager && managerStore
      ? [managerStore]
      : []

  const formatBaht = (n: number) => `฿${(n || 0).toLocaleString()}`

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
                  {isOffice && <SelectItem value="All">전체</SelectItem>}
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
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : data ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {data.yearMonth} · {data.storeFilter}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-sm font-semibold mb-2">{t("bs_assets")}</div>
                  <div className="text-xs text-muted-foreground">{t("bs_cashAndBanks")}</div>
                  <div className="font-mono text-right">{formatBaht(data.assets.cashAndBanks)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("bs_inventory")}</div>
                  <div className="font-mono text-right">{formatBaht(data.assets.inventory)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("bs_receivables")}</div>
                  <div className="font-mono text-right">{formatBaht(data.assets.receivables)}</div>
                  <div className="border-t mt-2 pt-2 text-sm font-semibold flex justify-between">
                    <span>{t("bs_total")}</span>
                    <span className="font-mono">{formatBaht(data.assets.total)}</span>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-sm font-semibold mb-2">부채</div>
                  <div className="text-xs text-muted-foreground">미지급금</div>
                  <div className="font-mono text-right">{formatBaht(data.liabilities.payables)}</div>
                  <div className="border-t mt-2 pt-2 text-sm font-semibold flex justify-between">
                    <span>합계</span>
                    <span className="font-mono">{formatBaht(data.liabilities.total)}</span>
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-sm font-semibold mb-2">{t("bs_equity")}</div>
                  <div className="text-xs text-muted-foreground">{t("bs_openingCapital")}</div>
                  <div className="font-mono text-right">{formatBaht(data.equity.openingCapital)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("bs_currentPeriodProfit")}</div>
                  <div className="font-mono text-right">{formatBaht(data.equity.currentPeriodProfit)}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("bs_retainedEarningsYtd")}</div>
                  <div className="font-mono text-right">{formatBaht(data.equity.retainedEarningsYtd)}</div>
                  <div className="border-t mt-2 pt-2 text-sm font-semibold flex justify-between">
                    <span>{t("bs_total")}</span>
                    <span className="font-mono">{formatBaht(data.equity.total)}</span>
                  </div>
                </div>
              </div>

              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  Math.abs(data.balanceCheckDiff) < 1
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                {t("bs_balanceCheck")}: <span className="font-mono font-semibold">{formatBaht(data.balanceCheckDiff)}</span>
              </div>

              {data.unpostedBankWithdrawals && data.unpostedBankWithdrawals.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
                  <div className="font-semibold text-amber-900 mb-2">
                    {t("bs_unpostedWithdrawals")} ({data.unpostedBankWithdrawals.length}건, 합계 {formatBaht(data.unpostedBankWithdrawals.reduce((s, x) => s + x.amount, 0))})
                  </div>
                  <div className="text-xs text-amber-800 overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full min-w-[320px]">
                      <thead>
                        <tr className="border-b border-amber-200">
                          <th className="text-left py-1 pr-2">날짜</th>
                          <th className="text-right py-1 pr-2">금액</th>
                          <th className="text-left py-1 pr-2">용도</th>
                          <th className="text-left py-1 min-w-0">적요</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.unpostedBankWithdrawals.map((row) => (
                          <tr key={row.id} className="border-b border-amber-100 last:border-0">
                            <td className="py-1 pr-2">{row.transDate}</td>
                            <td className="font-mono text-right py-1 pr-2">{formatBaht(row.amount)}</td>
                            <td className="py-1 pr-2 text-amber-700">{row.category}</td>
                            <td className="py-1 truncate max-w-[180px]" title={row.memo ?? row.store ?? ""}>{getMemo(row.memo ?? undefined, row.store ?? undefined)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-amber-700 mt-2">{t("bs_unpostedWithdrawalsHint")}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("msg_click_query")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

