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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Calculator, Save, Pencil } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import { getLoginData } from "@/lib/api-client"

function toMonthStr(d?: Date): string {
  const x = d || new Date()
  return x.toISOString().slice(0, 7)
}

type PayrollRow = {
  id?: string
  month?: string
  store: string
  name: string
  dept?: string
  role?: string
  salary: number
  posAllow: number
  hazAllow: number
  birthBonus: number
  holidayPay: number
  holidayWorkDays?: number
  splBonus: number
  ot15?: number
  ot20?: number
  ot30?: number
  otAmt: number
  lateMin: number
  lateDed: number
  sso: number
  tax: number
  otherDed: number
  netPay: number
  status?: string
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function calcNetPay(r: PayrollRow): number {
  const income =
    r.salary +
    r.posAllow +
    r.hazAllow +
    r.birthBonus +
    r.holidayPay +
    r.splBonus +
    r.otAmt
  const deduct = r.lateDed + r.sso + r.tax + r.otherDed
  return Math.max(0, income - deduct)
}

export function AdminPayrollCalc() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()

  const [monthStr, setMonthStr] = useState(toMonthStr())
  const [storeFilter, setStoreFilter] = useState(isManager && userStore ? userStore : "All")
  const [stores, setStores] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [list, setList] = useState<PayrollRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editIdx, setEditIdx] = useState(-1)
  const [editSplBonus, setEditSplBonus] = useState("0")
  const [editOtAmt, setEditOtAmt] = useState("0")
  const [editLateDed, setEditLateDed] = useState("0")
  const [editOtherDed, setEditOtherDed] = useState("0")

  useEffect(() => {
    if (!auth?.store) return
    getLoginData().then((r) => {
      const keys = Object.keys(r.users || {}).filter(Boolean).sort()
      setStores(["All", ...keys.filter((s) => s !== "All")])
    })
  }, [auth?.store])

  useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

  const handleCalc = async () => {
    setLoading(true)
    setError(null)
    try {
      const effectiveStore = isManager && userStore ? userStore : (storeFilter === "All" ? "" : storeFilter)
      const params = new URLSearchParams({
        month: monthStr,
        storeFilter: effectiveStore,
        userStore: auth?.store || "",
        userRole: auth?.role || "",
      })
      const res = await fetch(`/api/getPayrollCalc?${params}`)
      const data = await res.json()
      if (data.list && Array.isArray(data.list)) {
        setError(null)
        const rows: PayrollRow[] = data.list.map((r: Record<string, unknown>) => ({
          id: String(r.id || ""),
          month: String(r.month || ""),
          store: String(r.store || ""),
          name: String(r.name || ""),
          dept: String(r.dept || ""),
          role: String(r.role || ""),
          salary: Number(r.salary) || 0,
          posAllow: Number(r.posAllow) || 0,
          hazAllow: Number(r.hazAllow) || 0,
          birthBonus: Number(r.birthBonus) || 0,
          holidayPay: Number(r.holidayPay) || 0,
          holidayWorkDays: Number(r.holidayWorkDays) || 0,
          splBonus: Number(r.splBonus) || 0,
          ot15: Number(r.ot15) || 0,
          ot20: Number(r.ot20) || 0,
          ot30: Number(r.ot30) || 0,
          otAmt: Number(r.otAmt) || 0,
          lateMin: Number(r.lateMin) || 0,
          lateDed: Number(r.lateDed) || 0,
          sso: Number(r.sso) || 0,
          tax: Number(r.tax) || 0,
          otherDed: Number(r.otherDed) || 0,
          netPay: calcNetPay({
            ...r,
            salary: Number(r.salary) || 0,
            posAllow: Number(r.posAllow) || 0,
            hazAllow: Number(r.hazAllow) || 0,
            birthBonus: Number(r.birthBonus) || 0,
            holidayPay: Number(r.holidayPay) || 0,
            splBonus: Number(r.splBonus) || 0,
            otAmt: Number(r.otAmt) || 0,
            lateDed: Number(r.lateDed) || 0,
            sso: Number(r.sso) || 0,
            tax: Number(r.tax) || 0,
            otherDed: Number(r.otherDed) || 0,
          } as PayrollRow),
          status: String(r.status || "대기"),
        }))
        setList(rows)
        alert("✅ " + t("pay_calc_done"))
      } else {
        setList([])
        const errMsg = data.detail ? `${data.msg}\n(${data.detail})` : (data.msg || t("pay_error"))
        setError(errMsg)
      }
    } catch (e) {
      setList([])
      const errMsg = e instanceof Error ? e.message : t("pay_error")
      setError(errMsg)
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

  const openEdit = (idx: number) => {
    const r = list[idx]
    setEditIdx(idx)
    setEditSplBonus(String(r.splBonus || 0))
    setEditOtAmt(String(r.otAmt || 0))
    setEditLateDed(String(r.lateDed || 0))
    setEditOtherDed(String(r.otherDed || 0))
    setEditOpen(true)
  }

  const applyEdit = () => {
    if (editIdx < 0) return
    const r = list[editIdx]
    const splBonus = Number(editSplBonus) || 0
    const otAmt = Number(editOtAmt) || 0
    const lateDed = Number(editLateDed) || 0
    const otherDed = Number(editOtherDed) || 0
    const updated: PayrollRow = {
      ...r,
      splBonus,
      otAmt,
      lateDed,
      otherDed,
      netPay: calcNetPay({ ...r, splBonus, otAmt, lateDed, otherDed }),
    }
    setList((prev) => prev.map((row, i) => (i === editIdx ? updated : row)))
    setEditOpen(false)
  }

  const handleSave = async () => {
    if (list.length === 0) return
    if (!confirm("⚠️ " + monthStr + t("pay_month_suffix") + " " + t("pay_save_confirm_msg"))) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        monthStr,
        userStore: auth?.store || "",
        userRole: auth?.role || "",
        list: list.map((r) => ({
          store: r.store,
          name: r.name,
          dept: r.dept || "",
          role: r.role || "",
          salary: r.salary,
          posAllow: r.posAllow,
          hazAllow: r.hazAllow,
          birthBonus: r.birthBonus,
          holidayPay: r.holidayPay,
          holidayWorkDays: r.holidayWorkDays || 0,
          splBonus: r.splBonus,
          ot15: r.ot15 || 0,
          ot20: r.ot20 || 0,
          ot30: r.ot30 || 0,
          otAmt: r.otAmt,
          lateMin: r.lateMin,
          lateDed: r.lateDed,
          sso: r.sso,
          tax: r.tax,
          otherDed: r.otherDed,
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
            onClick={handleCalc}
            disabled={loading}
          >
            <Calculator className="mr-1.5 h-3.5 w-3.5" />
            {loading ? t("loading") : t("pay_calc_run")}
          </Button>
          <Button
            className="h-9 font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !hasResult}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? t("loading") : t("pay_save_confirm")}
          </Button>
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-xs text-blue-800 dark:text-blue-200 space-y-0.5">
          <p>{t("pay_calc_hint_line1")}</p>
          <p>{t("pay_calc_hint_line2")}</p>
          <p>{t("pay_calc_hint_line3")}</p>
          <p>{t("pay_calc_hint_line4")}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {hasResult && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs border-collapse min-w-[1200px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th rowSpan={2} className="p-2 text-center font-medium min-w-[2rem]">No</th>
                  <th rowSpan={2} className="p-2 text-left font-medium min-w-[5rem]">{t("pay_col_store")}</th>
                  <th rowSpan={2} className="p-2 text-left font-medium min-w-[6rem]">{t("pay_col_name")}</th>
                  <th rowSpan={2} className="p-2 text-right font-medium bg-muted/70">{t("pay_col_base")}</th>
                  <th colSpan={5} className="p-2 text-center font-medium text-primary">{t("pay_allowance")}</th>
                  <th colSpan={2} className="p-2 text-center font-medium text-primary">{t("pay_ot")}</th>
                  <th colSpan={3} className="p-2 text-center font-medium text-destructive">{t("pay_deduct")}</th>
                  <th rowSpan={2} className="p-2 text-right font-medium font-semibold bg-muted/70">{t("pay_net")}</th>
                  <th rowSpan={2} className="p-2 text-center font-medium min-w-[4rem]">{t("pay_edit")}</th>
                </tr>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_role")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_risk")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_birth")}</th>
                  <th className="p-1.5 text-center font-medium text-primary" title={t("pay_col_holiday")}>{t("pay_col_holiday")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_bonus")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_ot_hr")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_ot_amt")}</th>
                  <th className="p-1.5 text-center font-medium text-destructive">{t("pay_col_late")}</th>
                  <th className="p-1.5 text-center font-medium text-destructive">{t("pay_col_sso")}</th>
                  <th className="p-1.5 text-center font-medium text-destructive">{t("pay_col_etc")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr
                    key={`${r.store}_${r.name}_${i}`}
                    className="border-b border-border/60 hover:bg-muted/30"
                  >
                    <td className="p-2 text-center">{i + 1}</td>
                    <td className="p-2 font-medium">{r.store}</td>
                    <td className="p-2">
                      <span className="font-medium">{r.name}</span>
                      {r.role ? <><br /><small className="text-muted-foreground">{r.role}</small></> : null}
                    </td>
                    <td className="p-2 text-right">{fmt(r.salary)}</td>
                    <td className="p-2 text-right">{fmt(r.posAllow)}</td>
                    <td className="p-2 text-right">{fmt(r.hazAllow)}</td>
                    <td className="p-2 text-right">{fmt(r.birthBonus)}</td>
                    <td className="p-2 text-right">
                      {fmt(r.holidayPay)}
                      {r.holidayWorkDays != null && r.holidayWorkDays > 0 && (
                        <small className="text-muted-foreground ml-0.5">({r.holidayWorkDays}일)</small>
                      )}
                    </td>
                    <td className="p-2 text-right font-medium">{fmt(r.splBonus)}</td>
                    <td className="p-2 text-center text-muted-foreground">
                      (1.5: {r.ot15 ?? 0}h)
                    </td>
                    <td className="p-2 text-right font-medium">{fmt(r.otAmt)}</td>
                    <td className="p-2 text-right">{fmt(r.lateDed)}</td>
                    <td className="p-2 text-right">{fmt(r.sso)}</td>
                    <td className="p-2 text-right font-medium">{fmt(r.otherDed)}</td>
                    <td className="p-2 text-right font-semibold">{fmt(r.netPay)}</td>
                    <td className="p-2 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => openEdit(i)}
                      >
                        ✏️ {t("pay_edit")}
                      </Button>
                    </td>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pay_modal_title")}</DialogTitle>
          </DialogHeader>
          {editIdx >= 0 && editIdx < list.length && (
            <>
              <div className="text-center py-2">
                <p className="font-semibold text-base">{list[editIdx].name}</p>
                <p className="text-sm text-muted-foreground">{list[editIdx].store}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 py-2">
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">➕ {t("pay_modal_ot")}</label>
                  <Input
                    type="number"
                    value={editOtAmt}
                    onChange={(e) => setEditOtAmt(e.target.value)}
                    className="text-end"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary block mb-1">➕ {t("pay_modal_bonus")}</label>
                  <Input
                    type="number"
                    value={editSplBonus}
                    onChange={(e) => setEditSplBonus(e.target.value)}
                    className="text-end"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-destructive block mb-1">➖ {t("pay_modal_late")}</label>
                  <Input
                    type="number"
                    value={editLateDed}
                    onChange={(e) => setEditLateDed(e.target.value)}
                    className="text-end"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-destructive block mb-1">➖ {t("pay_modal_other_ded")}</label>
                  <Input
                    type="number"
                    value={editOtherDed}
                    onChange={(e) => setEditOtherDed(e.target.value)}
                    className="text-end"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("pay_modal_help")}</p>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("pay_modal_cancel")}
            </Button>
            <Button onClick={applyEdit}>{t("pay_modal_apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
