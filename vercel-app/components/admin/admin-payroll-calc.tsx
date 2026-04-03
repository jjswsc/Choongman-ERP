"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect, useMemo } from "react"
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
import Link from "next/link"
import { Calculator, Save, FolderOpen, Calendar, Clock } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import { apiFetch, useStoreList } from "@/lib/api-client"
import {
  i18nVar,
  isPayrollExplainSumRow,
  translatePayrollExplainDetail,
  translatePayrollExplainReason,
} from "@/lib/payroll-explain-i18n"

/** 급여 산출 상세에서 날짜 클릭 시 휴가 관리로 보낼 사유(API reason 원문) */
const PAYROLL_EXPLAIN_DATE_TO_LEAVE_REASONS = new Set(["결석 공제", "무급휴가"])

function toMonthStr(d?: Date): string {
  const x = d || new Date()
  return x.toISOString().slice(0, 7)
}

type PayrollRow = {
  id?: string
  month?: string
  store: string
  name: string
  employeeId?: number
  employeeCode?: string
  dept?: string
  role?: string
  salary: number
  posAllow: number
  hazAllow: number
  diligenceAllow: number
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
  earlyMin?: number
  earlyDed?: number
  sso: number
  tax: number
  otherDed: number
  netPay: number
  status?: string
  calcExplain?: PayrollCalcExplain
}

type PayrollExplainEntry = {
  date?: string
  reason: string
  detail?: string
  amount?: number
  minutes?: number
}

type PayrollCalcExplain = {
  salary: PayrollExplainEntry[]
  posAllow: PayrollExplainEntry[]
  hazAllow: PayrollExplainEntry[]
  diligenceAllow: PayrollExplainEntry[]
  birthBonus: PayrollExplainEntry[]
  holidayPay: PayrollExplainEntry[]
  splBonus: PayrollExplainEntry[]
  ot: PayrollExplainEntry[]
  lateEarly: PayrollExplainEntry[]
  sso: PayrollExplainEntry[]
  otherDed: PayrollExplainEntry[]
}

const PAYROLL_EXPLAIN_TITLE_KEY: Partial<Record<keyof PayrollCalcExplain, string>> = {
  salary: "pay_salary",
  posAllow: "pay_pos_allow",
  hazAllow: "pay_haz_allow",
  diligenceAllow: "pay_diligence_allow",
  birthBonus: "pay_birth",
  holidayPay: "pay_holiday",
  splBonus: "pay_spl_bonus",
  ot: "pay_modal_ot",
  lateEarly: "pay_explain_title_late_early",
  sso: "pay_explain_reason_sso",
  otherDed: "pay_other_ded",
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function calcNetPay(r: PayrollRow): number {
  const diligence = r.diligenceAllow ?? 0
  const income =
    r.salary +
    r.posAllow +
    r.hazAllow +
    diligence +
    r.birthBonus +
    r.holidayPay +
    r.splBonus +
    r.otAmt
  const deduct = r.lateDed + (r.earlyDed ?? 0) + r.sso + r.tax + r.otherDed
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
  const [editSso, setEditSso] = useState("0")
  const [editOtherDed, setEditOtherDed] = useState("0")
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainTitle, setExplainTitle] = useState("")
  const [explainItems, setExplainItems] = useState<PayrollExplainEntry[]>([])
  const [explainTargetAmount, setExplainTargetAmount] = useState<number>(0)
  const [explainStore, setExplainStore] = useState("")
  const [explainEmployee, setExplainEmployee] = useState("")

  const { stores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    setStores(["All", ...storeList.filter((s) => s !== "All")])
  }, [auth?.store, storeList])

  useEffect(() => {
    if (isManager && userStore) setStoreFilter(userStore)
  }, [isManager, userStore])

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const effectiveStore = isManager && userStore ? userStore : (storeFilter === "All" ? "" : storeFilter)
      const params = new URLSearchParams({
        monthStr,
        userStore: auth?.store || "",
        userRole: auth?.role || "",
      })
      if (effectiveStore) params.set("storeFilter", effectiveStore)
      const res = await apiFetch(`/api/getPayrollRecords?${params}`)
      const data = await res.json()
      if (data.success && data.list && Array.isArray(data.list)) {
        const rows: PayrollRow[] = data.list.map((r: Record<string, unknown>) => ({
          id: String(r.id || ""),
          month: String(r.month || ""),
          store: String(r.store || ""),
          name: String(r.name || ""),
          employeeId: Number(r.employee_id || 0) || undefined,
          employeeCode: String(r.employee_code || ""),
          dept: String(r.dept || ""),
          role: String(r.role || ""),
          salary: Number(r.salary) || 0,
          posAllow: Number(r.pos_allow) ?? 0,
          hazAllow: Number(r.haz_allow) ?? 0,
          diligenceAllow: Number(r.diligence_allow) || 0,
          birthBonus: Number(r.birth_bonus) ?? 0,
          holidayPay: Number(r.holiday_pay) ?? 0,
          holidayWorkDays: 0,
          splBonus: Number(r.spl_bonus) ?? 0,
          ot15: Number(r.ot_15) ?? 0,
          ot20: Number(r.ot_20) ?? 0,
          ot30: Number(r.ot_30) ?? 0,
          otAmt: Number(r.ot_amt) ?? 0,
          lateMin: Number(r.late_min) ?? 0,
          lateDed: Number(r.late_ded) ?? 0,
          earlyMin: Number(r.early_min) ?? 0,
          earlyDed: Number(r.early_ded) ?? 0,
          sso: Number(r.sso) ?? 0,
          tax: Number(r.tax) ?? 0,
          otherDed: Number(r.other_ded) ?? 0,
          netPay: Number(r.net_pay) ?? 0,
          status: String(r.status || "대기"),
        }))
        setList(rows)
        setError(null)
        await appAlert("✅ " + t("pay_load_done"))
      } else {
        setList([])
        setError(data.msg || t("pay_no_data"))
      }
    } catch (e) {
      setList([])
      setError(e instanceof Error ? e.message : t("pay_error"))
    } finally {
      setLoading(false)
      setQueried(true)
    }
  }

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
      const res = await apiFetch(`/api/getPayrollCalc?${params}`)
      const data = await res.json()
      if (data.list && Array.isArray(data.list)) {
        setError(null)
        const rows: PayrollRow[] = data.list.map((r: Record<string, unknown>) => ({
          id: String(r.id || ""),
          month: String(r.month || ""),
          store: String(r.store || ""),
          name: String(r.name || ""),
          employeeId: Number(r.employeeId || 0) || undefined,
          employeeCode: String(r.employeeCode || ""),
          dept: String(r.dept || ""),
          role: String(r.role || ""),
          salary: Number(r.salary) || 0,
          posAllow: Number(r.posAllow) || 0,
          hazAllow: Number(r.hazAllow) || 0,
          diligenceAllow: Number(r.diligenceAllow) || 0,
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
          earlyMin: Number(r.earlyMin) || 0,
          earlyDed: Number(r.earlyDed) || 0,
          sso: Number(r.sso) || 0,
          tax: Number(r.tax) || 0,
          otherDed: Number(r.otherDed) || 0,
          netPay: calcNetPay({
            ...r,
            salary: Number(r.salary) || 0,
            posAllow: Number(r.posAllow) || 0,
            hazAllow: Number(r.hazAllow) || 0,
            diligenceAllow: Number(r.diligenceAllow) || 0,
            birthBonus: Number(r.birthBonus) || 0,
            holidayPay: Number(r.holidayPay) || 0,
            splBonus: Number(r.splBonus) || 0,
            otAmt: Number(r.otAmt) || 0,
            lateDed: Number(r.lateDed) || 0,
            earlyDed: Number(r.earlyDed) || 0,
            sso: Number(r.sso) || 0,
            tax: Number(r.tax) || 0,
            otherDed: Number(r.otherDed) || 0,
          } as PayrollRow),
          status: String(r.status || "대기"),
          calcExplain: (r.calcExplain as PayrollCalcExplain | undefined),
        }))
        setList(rows)
        await appAlert("✅ " + t("pay_calc_done"))
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

  const payrollColumnTotals = useMemo(() => {
    return list.reduce(
      (acc, r) => ({
        salary: acc.salary + r.salary,
        posAllow: acc.posAllow + r.posAllow,
        hazAllow: acc.hazAllow + r.hazAllow,
        diligenceAllow: acc.diligenceAllow + (r.diligenceAllow ?? 0),
        birthBonus: acc.birthBonus + r.birthBonus,
        holidayPay: acc.holidayPay + r.holidayPay,
        splBonus: acc.splBonus + r.splBonus,
        ot15: acc.ot15 + (r.ot15 ?? 0),
        otAmt: acc.otAmt + r.otAmt,
        lateEarly: acc.lateEarly + (r.lateDed || 0) + (r.earlyDed ?? 0),
        sso: acc.sso + r.sso,
        otherDed: acc.otherDed + r.otherDed,
        netPay: acc.netPay + r.netPay,
      }),
      {
        salary: 0,
        posAllow: 0,
        hazAllow: 0,
        diligenceAllow: 0,
        birthBonus: 0,
        holidayPay: 0,
        splBonus: 0,
        ot15: 0,
        otAmt: 0,
        lateEarly: 0,
        sso: 0,
        otherDed: 0,
        netPay: 0,
      }
    )
  }, [list])

  const explainDetailSum = explainItems.reduce((sum, item) => {
    if (item.amount == null) return sum
    if (isPayrollExplainSumRow(item.reason)) return sum
    return sum + item.amount
  }, 0)
  const explainDiff = explainDetailSum - explainTargetAmount
  const explainMismatch = explainDiff !== 0

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
    setEditSso(String(r.sso || 0))
    setEditOtherDed(String(r.otherDed || 0))
    setEditOpen(true)
  }

  const applyEdit = () => {
    if (editIdx < 0) return
    const r = list[editIdx]
    const splBonus = Number(editSplBonus) || 0
    const otAmt = Number(editOtAmt) || 0
    const lateDed = Number(editLateDed) || 0
    const sso = Math.max(0, Math.floor(Number(editSso) || 0))
    const otherDed = Number(editOtherDed) || 0
    const updated: PayrollRow = {
      ...r,
      splBonus,
      otAmt,
      lateDed,
      sso,
      otherDed,
      netPay: calcNetPay({ ...r, splBonus, otAmt, lateDed, sso, otherDed }),
    }
    setList((prev) => prev.map((row, i) => (i === editIdx ? updated : row)))
    setEditOpen(false)
  }

  const openExplain = (row: PayrollRow, key: keyof PayrollCalcExplain) => {
    const items = row.calcExplain?.[key] || []
    if (!items.length) {
      void appAlert(t("pay_explain_no_calc_alert"))
      return
    }
    const targetAmountByKey: Partial<Record<keyof PayrollCalcExplain, number>> = {
      salary: row.salary,
      posAllow: row.posAllow,
      hazAllow: row.hazAllow,
      diligenceAllow: row.diligenceAllow,
      birthBonus: row.birthBonus,
      holidayPay: row.holidayPay,
      splBonus: row.splBonus,
      ot: row.otAmt,
      lateEarly: (row.lateDed || 0) + (row.earlyDed ?? 0),
      sso: row.sso,
      otherDed: row.otherDed,
    }
    const titleKey = PAYROLL_EXPLAIN_TITLE_KEY[key] || "pay_explain_title_fallback"
    setExplainTargetAmount(targetAmountByKey[key] ?? 0)
    setExplainTitle(`${row.store} ${row.name} - ${t(titleKey)}`)
    setExplainStore(row.store)
    setExplainEmployee(row.name)
    setExplainItems(items)
    setExplainOpen(true)
  }

  const handleSave = async () => {
    if (list.length === 0) return
    if (!await appConfirm("⚠️ " + monthStr + t("pay_month_suffix") + " " + t("pay_save_confirm_msg"))) return
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
          employeeId: r.employeeId,
          employeeCode: r.employeeCode || "",
          dept: r.dept || "",
          role: r.role || "",
          salary: r.salary,
          posAllow: r.posAllow,
          hazAllow: r.hazAllow,
          diligenceAllow: r.diligenceAllow,
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
          earlyMin: r.earlyMin ?? 0,
          earlyDed: r.earlyDed ?? 0,
          sso: r.sso,
          tax: r.tax,
          otherDed: r.otherDed,
          netPay: r.netPay,
          status: "확정",
        })),
      }
      const res = await apiFetch("/api/savePayroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setError(null)
        const created = Number(data?.payrollExpenseSync?.created || 0)
        const updated = Number(data?.payrollExpenseSync?.updated || 0)
        await appAlert(
          `${t("pay_save_success")}\n${i18nVar(t("pay_save_expense_sync"), { c: created, u: updated })}`
        )
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
            variant="outline"
            className="h-9 font-medium"
            onClick={handleLoad}
            disabled={loading}
          >
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            {loading ? t("loading") : t("pay_load_from_db")}
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
          <p>{t("pay_calc_hint_line5")}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {hasResult && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs border-collapse min-w-[1120px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th rowSpan={2} className="p-1.5 text-center font-medium w-8 min-w-[2rem]">No</th>
                  <th rowSpan={2} className="p-1.5 text-left font-medium min-w-[4rem] max-w-[5.5rem]">{t("pay_col_store")}</th>
                  <th rowSpan={2} className="p-1.5 text-left font-medium min-w-[4.5rem] max-w-[6.5rem]">{t("pay_col_name")}</th>
                  <th rowSpan={2} className="p-1.5 text-center font-medium min-w-[4.5rem]">{t("emp_label_employee_code")}</th>
                  <th rowSpan={2} className="p-1.5 text-right font-medium bg-muted/70 whitespace-nowrap tabular-nums w-[1%] min-w-[4.25rem]">{t("pay_col_base")}</th>
                  <th colSpan={6} className="p-2 text-center font-medium text-primary">{t("pay_allowance")}</th>
                  <th colSpan={2} className="p-2 text-center font-medium text-primary">{t("pay_ot")}</th>
                  <th colSpan={3} className="p-2 text-center font-medium text-destructive">{t("pay_deduct")}</th>
                  <th rowSpan={2} className="p-1.5 text-right font-medium font-semibold bg-muted/70 whitespace-nowrap tabular-nums">{t("pay_net")}</th>
                  <th
                    rowSpan={2}
                    className="p-1.5 text-center font-medium w-[4.5rem] min-w-[4.5rem] sticky right-0 z-20 bg-muted/95 backdrop-blur-sm border-l border-border shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.25)] dark:bg-muted/95 dark:shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.5)]"
                  >
                    {t("pay_edit")}
                  </th>
                </tr>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_role")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_risk")}</th>
                  <th className="p-1.5 text-center font-medium text-primary">{t("pay_col_diligence")}</th>
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
                    className="group border-b border-border/60 hover:bg-muted/30"
                  >
                    <td className="p-1.5 text-center">{i + 1}</td>
                    <td className="p-1.5 font-medium truncate max-w-[5.5rem]" title={r.store}>{r.store}</td>
                    <td className="p-1.5 min-w-0 max-w-[6.5rem]">
                      <span className="font-medium block truncate" title={r.name}>{r.name}</span>
                      {r.role ? <small className="text-muted-foreground block truncate" title={r.role}>{r.role}</small> : null}
                    </td>
                    <td className="p-1.5 text-center whitespace-nowrap tabular-nums">{r.employeeCode || "-"}</td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(r.salary)}</td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "posAllow")}
                      >
                        {fmt(r.posAllow)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "hazAllow")}
                      >
                        {fmt(r.hazAllow)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "diligenceAllow")}
                      >
                        {fmt(r.diligenceAllow ?? 0)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "birthBonus")}
                      >
                        {fmt(r.birthBonus)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "holidayPay")}
                      >
                        {fmt(r.holidayPay)}
                      </button>
                      {r.holidayWorkDays != null && r.holidayWorkDays > 0 && (
                        <small className="text-muted-foreground ml-0.5">
                          {i18nVar(t("pay_explain_holiday_days_suffix"), { n: r.holidayWorkDays })}
                        </small>
                      )}
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums font-medium">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "splBonus")}
                      >
                        {fmt(r.splBonus)}
                      </button>
                    </td>
                    <td className="p-1.5 text-center text-muted-foreground whitespace-nowrap">
                      {i18nVar(t("pay_explain_ot_line"), { h: r.ot15 ?? 0 })}
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums font-medium">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "ot")}
                      >
                        {fmt(r.otAmt)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "lateEarly")}
                      >
                        {fmt((r.lateDed || 0) + (r.earlyDed ?? 0))}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "sso")}
                      >
                        {fmt(r.sso)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right whitespace-nowrap tabular-nums font-medium">
                      <button
                        type="button"
                        className="block w-full text-right hover:underline underline-offset-2"
                        onClick={() => openExplain(r, "otherDed")}
                      >
                        {fmt(r.otherDed)}
                      </button>
                    </td>
                    <td className="p-1.5 text-right font-semibold whitespace-nowrap tabular-nums">{fmt(r.netPay)}</td>
                    <td className="p-1.5 text-center sticky right-0 z-10 bg-background border-l border-border shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.12)] group-hover:bg-muted/30 dark:bg-card dark:shadow-[-6px_0_12px_-8px_rgba(0,0,0,0.45)]">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-1.5 text-[10px] shrink-0"
                        onClick={() => openEdit(i)}
                      >
                        ✏️ {t("pay_edit")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/80 font-semibold">
                  <td className="p-1.5 text-center text-muted-foreground">—</td>
                  <td colSpan={2} className="p-1.5 text-left">
                    {i18nVar(t("pay_calc_table_total"), { n: String(list.length) })}
                  </td>
                  <td className="p-1.5 text-center">—</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.salary)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.posAllow)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.hazAllow)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.diligenceAllow)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.birthBonus)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.holidayPay)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.splBonus)}</td>
                  <td className="p-1.5 text-center text-muted-foreground whitespace-nowrap">
                    {i18nVar(t("pay_explain_ot_line"), {
                      h: Math.round(payrollColumnTotals.ot15 * 10) / 10,
                    })}
                  </td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.otAmt)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.lateEarly)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.sso)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums">{fmt(payrollColumnTotals.otherDed)}</td>
                  <td className="p-1.5 text-right whitespace-nowrap tabular-nums text-primary">{fmt(payrollColumnTotals.netPay)}</td>
                  <td className="p-1.5 text-center sticky right-0 z-10 bg-muted/95 border-l border-border">—</td>
                </tr>
              </tfoot>
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
                  <label className="text-xs font-semibold text-destructive block mb-1">➖ {t("pay_col_sso")}</label>
                  <Input
                    type="number"
                    min={0}
                    value={editSso}
                    onChange={(e) => setEditSso(e.target.value)}
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
              <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">{t("pay_modal_hr_nav_hint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-8" asChild>
                    <Link
                      href={`/admin/leave?tab=approval&month=${encodeURIComponent(monthStr)}&status=all${list[editIdx]?.store ? `&store=${encodeURIComponent(list[editIdx].store)}` : ""}${list[editIdx]?.name ? `&name=${encodeURIComponent(list[editIdx].name)}` : ""}`}
                    >
                      <Calendar className="mr-1.5 h-3.5 w-3.5" />
                      {t("pay_modal_link_leave")}
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" asChild>
                    <Link
                      href={`/admin/attendance?tab=status&month=${encodeURIComponent(monthStr)}${list[editIdx]?.store ? `&store=${encodeURIComponent(list[editIdx].store)}` : ""}${list[editIdx]?.name ? `&employee=${encodeURIComponent(list[editIdx].name)}` : ""}`}
                    >
                      <Clock className="mr-1.5 h-3.5 w-3.5" />
                      {t("pay_modal_link_attendance")}
                    </Link>
                  </Button>
                </div>
              </div>
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

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{explainTitle || t("pay_explain_title_fallback")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            {explainItems.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{t("pay_explain_no_rows")}</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr className="border-b">
                    <th className="p-2 text-left font-medium w-[7.5rem]">{t("pay_explain_th_date")}</th>
                    <th className="p-2 text-left font-medium">{t("pay_explain_th_reason")}</th>
                    <th className="p-2 text-left font-medium">{t("pay_explain_th_detail")}</th>
                    <th className="p-2 text-right font-medium w-[7rem]">{t("pay_explain_th_amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {explainItems.map((item, idx) => {
                    const isSumRow = isPayrollExplainSumRow(item.reason)
                    const highlightRow = explainMismatch && !isSumRow && item.amount != null
                    const detailCell =
                      item.detail != null && String(item.detail).trim() !== ""
                        ? translatePayrollExplainDetail(String(item.detail), t)
                        : item.minutes != null
                          ? i18nVar(t("pay_explain_detail_minutes_only"), { n: item.minutes })
                          : t("pay_explain_dash")
                    return (
                    <tr
                      key={`${item.date || "nodate"}_${item.reason}_${idx}`}
                      className={`border-b border-border/60 ${highlightRow ? "bg-amber-50/70 dark:bg-amber-950/20" : ""}`}
                    >
                      <td className="p-2">
                        {item.date ? (() => {
                          const qStore = explainStore ? `&store=${encodeURIComponent(explainStore)}` : ""
                          const toLeave = PAYROLL_EXPLAIN_DATE_TO_LEAVE_REASONS.has(item.reason)
                          const href = toLeave
                            ? `/admin/leave?tab=approval&month=${encodeURIComponent(monthStr)}&status=all${qStore}${explainEmployee ? `&name=${encodeURIComponent(explainEmployee)}` : ""}&focusDate=${encodeURIComponent(item.date)}`
                            : `/admin/attendance?tab=status&month=${encodeURIComponent(monthStr)}${qStore}${explainEmployee ? `&employee=${encodeURIComponent(explainEmployee)}` : ""}&focusDate=${encodeURIComponent(item.date)}`
                          return (
                            <Link href={href} className="text-blue-600 hover:underline">
                              {item.date}
                            </Link>
                          )
                        })() : (
                          t("pay_explain_dash")
                        )}
                      </td>
                      <td className="p-2">{translatePayrollExplainReason(item.reason, t)}</td>
                      <td className="p-2 text-muted-foreground">{detailCell}</td>
                      <td className="p-2 text-right">{item.amount != null ? fmt(item.amount) : t("pay_explain_dash")}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("pay_explain_sum_excl_total")}</span>
              <span className="font-medium">{fmt(explainDetailSum)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">{t("pay_explain_table_value")}</span>
              <span className="font-medium">{fmt(explainTargetAmount)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">{t("pay_explain_diff_label")}</span>
              <span className={explainMismatch ? "font-medium text-destructive" : "font-medium text-emerald-600"}>
                {explainDiff > 0 ? `+${fmt(explainDiff)}` : fmt(explainDiff)}
              </span>
            </div>
            {explainMismatch && (
              <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                {t("pay_explain_mismatch_hint")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExplainOpen(false)}>
              {t("pay_explain_close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
