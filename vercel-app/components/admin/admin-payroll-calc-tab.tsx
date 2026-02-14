"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calculator, Loader2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { getLoginData, getPayrollCalc, savePayrollRecords, type PayrollCalcRow } from "@/lib/api-client"

function currentMonthStr(): string {
  return new Date().toISOString().slice(0, 7)
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

export function AdminPayrollCalcTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [monthStr, setMonthStr] = useState(currentMonthStr())
  const [storeFilter, setStoreFilter] = useState("All")
  const [stores, setStores] = useState<string[]>([])
  const [list, setList] = useState<PayrollCalcRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!auth) return
    const isOffice = (auth.role || "").toLowerCase().includes("director") || auth.role === "officer" || auth.role === "ceo" || auth.role === "hr"
    getLoginData().then((r) => {
      const storeKeys = Object.keys(r.users || {}).filter(Boolean).sort()
      if (isOffice) {
        setStores(["All", ...storeKeys.filter((s) => s !== "All")])
      } else if (auth.store) {
        setStores([auth.store])
        setStoreFilter(auth.store)
      }
    })
  }, [auth])

  const runCalc = () => {
    if (!auth) return
    setLoading(true)
    getPayrollCalc({
      month: monthStr,
      store: storeFilter === "All" ? undefined : storeFilter,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then((r) => {
        if (r.success && r.list) setList(r.list)
        else setList([])
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }

  const handleSave = async () => {
    if (list.length === 0 || !auth) return
    setSaving(true)
    try {
      const res = await savePayrollRecords({ month: monthStr, list })
      if (res.success) {
        alert("저장되었습니다.")
      } else {
        alert(res.message || "저장 중 오류가 발생했습니다.")
      }
    } catch {
      alert("저장 중 오류가 발생했습니다.")
    } finally {
      setSaving(false)
    }
  }

  const monthOptions = (() => {
    const opts: string[] = []
    const now = new Date()
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(d.toISOString().slice(0, 7))
    }
    return opts
  })()

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Calculator className="h-3.5 w-3.5 text-primary" />
        </div>
        <CardTitle className="text-base font-semibold">{t("adminPayroll")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={monthStr} onValueChange={setMonthStr}>
            <SelectTrigger className="h-9 flex-1 min-w-[140px] text-xs">
              <SelectValue placeholder={t("pay_month")} />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-9 flex-1 min-w-[100px] text-xs">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button className="h-10 flex-1 font-medium" onClick={runCalc} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-1.5 h-3.5 w-3.5" />}
            {loading ? "계산 중..." : t("pay_calc_run")}
          </Button>
          <Button
            variant="outline"
            className="h-10 font-medium"
            onClick={handleSave}
            disabled={saving || list.length === 0}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("pay_save_confirm")}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs text-center min-w-[900px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-2 py-2 font-semibold">{t("pay_col_store")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_name")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_base")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_role")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_risk")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_birth")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_holiday")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_ot_hr")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_ot_amt")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_late")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_col_sso")}</th>
                <th className="px-2 py-2 font-semibold">{t("pay_net")}</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-muted-foreground">
                    {t("pay_query_please")}
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2 font-medium">{r.store}</td>
                    <td className="px-2 py-2 font-medium">{r.name}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.salary)}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.posAllow)}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.hazAllow)}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.birthBonus)}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.holidayPay)}</td>
                    <td className="px-2 py-2">{r.ot15}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.otAmt)}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.lateDed)}</td>
                    <td className="px-2 py-2 text-right">{formatNum(r.sso)}</td>
                    <td className="px-2 py-2 text-right font-bold text-primary">{formatNum(r.netPay)}</td>
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
