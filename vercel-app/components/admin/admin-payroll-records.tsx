"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
import { apiFetch, useStoreList, sendNotice } from "@/lib/api-client"
import { Megaphone } from "lucide-react"

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
  spl_bonus: number
  ot_amt: number
  late_min: number
  late_ded: number
  sso: number
  tax: number
  other_ded: number
  net_pay: number
  status?: string
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function sumAllowance(r: RecordRow): number {
  return (r.pos_allow || 0) + (r.haz_allow || 0) + (r.birth_bonus || 0) + (r.holiday_pay || 0) + (r.spl_bonus || 0)
}

function sumDeduct(r: RecordRow): number {
  return (r.late_ded || 0) + (r.sso || 0) + (r.tax || 0) + (r.other_ded || 0)
}

export function AdminPayrollRecords() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()

  const [monthStr, setMonthStr] = useState(toMonthStr())
  const [storeFilter, setStoreFilter] = useState(isManager && userStore ? userStore : "All")
  const [stores, setStores] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<RecordRow[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)
  const [sendingNotice, setSendingNotice] = useState(false)

  const { stores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    setStores(["All", ...storeList.filter((s) => s !== "All")])
  }, [auth?.store, storeList])

  useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

  const filteredList = list.filter((r) => storeFilter === "All" || r.store === storeFilter)
  const totalAmount = filteredList.reduce((sum, r) => sum + (r.net_pay || 0), 0)

  const handleQuery = async () => {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    setSelectAll(false)
    try {
      const effectiveStore = isManager && userStore ? userStore : (storeFilter === "All" ? "" : storeFilter)
      const params = new URLSearchParams({ monthStr })
      if (effectiveStore) params.set("storeFilter", effectiveStore)
      if (isManager) {
        params.set("userStore", userStore)
        params.set("userRole", auth?.role || "")
      }
      const res = await apiFetch(`/api/getPayrollRecords?${params}`)
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

  const handleToggleRow = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleToggleAll = (checked: boolean) => {
    setSelectAll(checked)
    if (checked) {
      setSelected(new Set(filteredList.map((_, i) => i)))
    } else {
      setSelected(new Set())
    }
  }

  const formatMonthLabel = (m: string) => {
    if (!m || m.length < 7) return m
    const [, mm] = m.split("-")
    const months = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
    return `${m.slice(0, 4)}년 ${months[parseInt(mm, 10) || 0] || mm}월`
  }

  const handleSendNotice = async () => {
    if (!monthStr) {
      alert(t("pay_month_select"))
      return
    }
    const toSend = Array.from(selected).map((i) => filteredList[i])
    if (toSend.length === 0) {
      alert(t("pay_notice_select_hint"))
      return
    }
    setSendingNotice(true)
    setError(null)
    try {
      const targetStore = storeFilter === "All" ? "전체" : storeFilter
      const title = `${formatMonthLabel(monthStr)} 급여 명세서 등록`
      const content = `급여 명세서가 등록되었습니다.\n앱 홈 → [내 급여 명세서]에서 확인하세요.`
      const res = await sendNotice({
        title,
        content,
        targetStore,
        targetRole: "전체",
        targetRecipients: toSend.map((r) => ({ store: r.store, name: r.name })),
        sender: auth?.user || "",
        userStore: auth?.store || "",
        userRole: auth?.role || "",
      })
      if (res.success) {
        alert(t("noticeSentSuccess"))
        setSelected(new Set())
        setSelectAll(false)
        window.dispatchEvent(new CustomEvent("notice-sent"))
      } else {
        setError(res.message || t("noticeSendFail"))
      }
    } catch {
      setError(t("noticeSendFail"))
    } finally {
      setSendingNotice(false)
    }
  }

  const hasResult = filteredList.length > 0

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
          {!isManager && (
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
          )}
          <Button
            className="h-9 font-medium"
            onClick={handleQuery}
            disabled={loading}
          >
            {loading ? t("loading") : t("btn_query_go")}
          </Button>
          {hasResult && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={handleSendNotice}
              disabled={sendingNotice || selected.size === 0}
            >
              <Megaphone className="mr-1.5 h-3.5 w-3.5" />
              {sendingNotice ? t("loading") : t("pay_send_notice")}
            </Button>
          )}
        </div>

        {hasResult && (
          <p className="mb-3 text-xs text-muted-foreground">{t("pay_delivery_hint")} {t("pay_notice_select_hint")}</p>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {hasResult && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 w-11 text-center">
                    <Checkbox
                      checked={selectAll}
                      onCheckedChange={(c) => handleToggleAll(!!c)}
                      aria-label={t("store")}
                    />
                  </th>
                  <th className="p-2 text-left font-medium">{t("pay_col_store")}</th>
                  <th className="p-2 text-left font-medium">{t("pay_col_name")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_col_base")}</th>
                  <th className="p-2 text-right font-medium text-primary">{t("pay_allowance_sum")}</th>
                  <th className="p-2 text-right font-medium text-primary">{t("pay_ot_sum")}</th>
                  <th className="p-2 text-right font-medium text-destructive">{t("pay_deduct_sum")}</th>
                  <th className="p-2 text-right font-medium font-semibold">{t("pay_net")}</th>
                  <th className="p-2 text-center font-medium">{t("wl_status")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((r, i) => {
                  const allowSum = sumAllowance(r)
                  const deductSum = sumDeduct(r)
                    return (
                    <tr key={`${r.store}_${r.name}_${i}`} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="p-2 text-center">
                        <Checkbox
                          checked={selected.has(i)}
                          onCheckedChange={() => handleToggleRow(i)}
                        />
                      </td>
                      <td className="p-2 font-medium">{r.store}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-right text-muted-foreground">{fmt(r.salary)}</td>
                      <td className="p-2 text-right text-primary">+{fmt(allowSum)}</td>
                      <td className="p-2 text-right text-primary">+{fmt(r.ot_amt || 0)}</td>
                      <td className="p-2 text-right text-destructive">-{fmt(deductSum)}</td>
                      <td className="p-2 text-right font-semibold bg-muted/30">{fmt(r.net_pay)}</td>
                      <td className="p-2 text-center">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                          {r.status === "확정" ? t("pay_status_confirmed") : r.status === "지급대기" ? t("pay_status_pending") : (r.status ? r.status : t("pay_status_pending"))}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-3 text-end font-bold text-base">
              {t("pay_total_amount")}: <span className="text-destructive">{fmt(totalAmount)}</span> THB
            </div>
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
