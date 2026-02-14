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
import { getLoginData } from "@/lib/api-client"

function toMonthStr(d?: Date): string {
  const x = d || new Date()
  return x.toISOString().slice(0, 7)
}

type RecordRow = {
  month: string
  store: string
  name: string
  salary: number
  pos_allow: number
  haz_allow: number
  birth_bonus: number
  holiday_pay: number
  ot_amt: number
  late_min: number
  late_ded: number
  sso: number
  net_pay: number
  status?: string
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function AdminPayrollRecords() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [monthStr, setMonthStr] = useState(toMonthStr())
  const [storeFilter, setStoreFilter] = useState("All")
  const [stores, setStores] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<RecordRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)

  useEffect(() => {
    if (!auth?.store) return
    getLoginData().then((r) => {
      const keys = Object.keys(r.users || {}).filter(Boolean).sort()
      setStores(["All", ...keys.filter((s) => s !== "All")])
    })
  }, [auth?.store])

  const handleQuery = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthStr })
      if (storeFilter && storeFilter !== "All") params.set("store", storeFilter)
      const res = await fetch(`/api/getPayrollRecords?${params}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.list)) {
        setList(data.list)
      } else {
        setList([])
        setError(translateApiMessage(data.msg) || t("pay_error"))
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
    if (m === "조회할 월(yyyy-MM)을 선택해주세요.") return t("pay_month_select")
    if (m === "급여 내역 조회 중 오류가 발생했습니다.") return t("pay_records_error")
    return msg
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
                    <td className="p-2 text-right">{fmt(r.pos_allow)}</td>
                    <td className="p-2 text-right">{fmt(r.haz_allow)}</td>
                    <td className="p-2 text-right">{fmt(r.birth_bonus)}</td>
                    <td className="p-2 text-right">{fmt(r.holiday_pay)}</td>
                    <td className="p-2 text-right">{fmt(r.ot_amt)}</td>
                    <td className="p-2 text-right">{r.late_min}</td>
                    <td className="p-2 text-right">{fmt(r.late_ded)}</td>
                    <td className="p-2 text-right">{fmt(r.sso)}</td>
                    <td className="p-2 text-right font-medium">{fmt(r.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!queried && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            {t("pay_records_query_please")}
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
