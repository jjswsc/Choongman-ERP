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
import { Calculator, Save } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { getLoginData } from "@/lib/api-client"

function toMonthStr(d?: Date): string {
  const x = d || new Date()
  return x.toISOString().slice(0, 7)
}

type PayrollRow = {
  store: string
  name: string
  salary: number
  posAllow: number
  hazAllow: number
  birthBonus: number
  holidayPay: number
  otAmt: number
  lateMin: number
  lateDed: number
  sso: number
  netPay: number
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function AdminPayrollCalc() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [monthStr, setMonthStr] = useState(toMonthStr())
  const [storeFilter, setStoreFilter] = useState("All")
  const [stores, setStores] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [list, setList] = useState<PayrollRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)

  useEffect(() => {
    if (!auth?.store) return
    getLoginData().then((r) => {
      const keys = Object.keys(r.users || {}).filter(Boolean).sort()
      setStores(["All", ...keys.filter((s) => s !== "All")])
    })
  }, [auth?.store])

  const handleCalc = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthStr })
      if (storeFilter && storeFilter !== "All") params.set("store", storeFilter)
      const res = await fetch(`/api/calculatePayroll?${params}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.list)) {
        setList(data.list)
      } else {
        setList([])
        setError(translateApiMessage(data.message) || t("pay_error"))
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

  const translateApiMessage = (msg: string | undefined): string => {
    if (!msg) return ""
    const m = msg.trim()
    if (m === "월(yyyy-MM)을 선택해주세요.") return t("pay_month_required")
    if (m === "저장할 데이터가 없습니다.") return t("pay_no_data_to_save")
    if (m.startsWith("저장 실패:")) return t("pay_save_fail") + m.slice("저장 실패:".length)
    return msg
  }

  const handleSave = async () => {
    if (list.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        monthStr,
        list: list.map((r) => ({
          store: r.store,
          name: r.name,
          salary: r.salary,
          posAllow: r.posAllow,
          hazAllow: r.hazAllow,
          birthBonus: r.birthBonus,
          holidayPay: r.holidayPay,
          otAmt: r.otAmt,
          lateMin: r.lateMin,
          lateDed: r.lateDed,
          sso: r.sso,
          netPay: r.netPay,
          status: "확정",
        })),
      }
      const res = await fetch("/api/savePayroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setError(null)
        alert(t("pay_save_success"))
      } else {
        setError(translateApiMessage(data.msg) || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-semibold block mb-1">{t("pay_month")}</label>
            <Input
              type="month"
              value={monthStr}
              onChange={(e) => setMonthStr(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-semibold block mb-1">{t("store")}</label>
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
          <Button
            className="h-9 font-medium"
            onClick={handleCalc}
            disabled={loading}
          >
            <Calculator className="mr-1.5 h-3.5 w-3.5" />
            {loading ? t("loading") : t("pay_calc_run")}
          </Button>
          {hasResult && (
            <Button
              variant="outline"
              className="h-9 font-medium"
              onClick={handleSave}
              disabled={saving}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? t("loading") : t("pay_save")}
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {hasResult && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-left font-medium">{t("store")}</th>
                  <th className="p-2 text-left font-medium">{t("emp_label_name")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_salary")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_pos_allow")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_haz_allow")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_birth")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_holiday")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_ot")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_late")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_late_ded")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_sso")}</th>
                  <th className="p-2 text-right font-medium font-semibold">{t("pay_net")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={`${r.store}_${r.name}_${i}`} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="p-2">{r.store}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-right">{fmt(r.salary)}</td>
                    <td className="p-2 text-right">{fmt(r.posAllow)}</td>
                    <td className="p-2 text-right">{fmt(r.hazAllow)}</td>
                    <td className="p-2 text-right">{fmt(r.birthBonus)}</td>
                    <td className="p-2 text-right">{fmt(r.holidayPay)}</td>
                    <td className="p-2 text-right">{fmt(r.otAmt)}</td>
                    <td className="p-2 text-right">{r.lateMin}</td>
                    <td className="p-2 text-right">{fmt(r.lateDed)}</td>
                    <td className="p-2 text-right">{fmt(r.sso)}</td>
                    <td className="p-2 text-right font-medium">{fmt(r.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!queried && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            {t("pay_query_please")}
          </div>
        )}

        {queried && !hasResult && !error && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {t("pay_no_data")}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
