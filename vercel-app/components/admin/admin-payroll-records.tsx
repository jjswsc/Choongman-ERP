"use client"
import { appAlert, appConfirm } from "@/lib/app-message"
import { buildErpExcelHtmlDocument, erpExcelSimpleTableStyle, triggerErpExcelHtmlDownload } from "@/lib/erp-excel-export"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useErpPageActiveRef } from "@/lib/erp-page-visibility"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import { buildPayrollStoreSelectOptions } from "@/lib/office-payroll-access"
import { useSyncOfficePayrollAccess } from "@/lib/use-office-payroll-access"
import { apiFetch, useStoreList, sendNotice } from "@/lib/api-client"
import { Megaphone, FileSpreadsheet, Calendar, Clock, ChevronDown } from "lucide-react"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"

function toMonthStr(d?: Date): string {
  const x = d || new Date()
  return x.toISOString().slice(0, 7)
}

type RecordRow = {
  month: string
  store: string
  name: string
  employee_id?: number
  employee_code?: string
  salary: number
  pos_allow: number
  haz_allow: number
  diligence_allow: number
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
  published_at?: string | null
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function sumAllowance(r: RecordRow): number {
  return (
    (r.pos_allow || 0) +
    (r.haz_allow || 0) +
    (r.diligence_allow || 0) +
    (r.birth_bonus || 0) +
    (r.holiday_pay || 0) +
    (r.spl_bonus || 0)
  )
}

function sumDeduct(r: RecordRow): number {
  return (r.late_ded || 0) + (r.sso || 0) + (r.tax || 0) + (r.other_ded || 0)
}

function payrollLeaveHref(month: string, store: string, name: string): string {
  const q = new URLSearchParams()
  q.set("tab", "approval")
  q.set("month", month)
  q.set("status", "all")
  if (store) q.set("store", store)
  if (name) q.set("name", name)
  return `/admin/leave?${q.toString()}`
}

function payrollAttendanceHref(month: string, store: string, name: string): string {
  const q = new URLSearchParams()
  q.set("tab", "status")
  q.set("month", month)
  if (store) q.set("store", store)
  if (name) q.set("employee", name)
  return `/admin/attendance?${q.toString()}`
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}


export function AdminPayrollRecords() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()
  useSyncOfficePayrollAccess()

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
  const [unpublishing, setUnpublishing] = useState(false)

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

  const filteredList = list.filter((r) => storeFilter === "All" || r.store === storeFilter)
  const totalAmount = filteredList.reduce((sum, r) => sum + (r.net_pay || 0), 0)

  const syncRecordsUrl = useCallback(
    (month: string, storeSel: string) => {
      const p = new URLSearchParams(searchParams.toString())
      p.set("tab", "records")
      p.set("month", month)
      p.set("store", storeSel)
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const fetchPayrollRecords = useCallback(
    async (month: string, storeSel: string) => {
      const effectiveStore = isManager && userStore ? userStore : (storeSel === "All" ? "" : storeSel)
      const params = new URLSearchParams({ monthStr: month })
      if (effectiveStore) params.set("storeFilter", effectiveStore)
      if (isManager) {
        params.set("userStore", userStore)
        params.set("userRole", auth?.role || "")
      }
      const res = await apiFetch(`/api/getPayrollRecords?${params}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.list)) {
        setList(data.list)
        setError(null)
      } else {
        setList([])
        const raw = typeof data.msg === "string" ? data.msg.trim() : ""
        let err = t("pay_error")
        if (raw === "조회할 월(yyyy-MM)을 선택해주세요.") err = t("pay_month_select")
        else if (raw === "급여 내역 조회 중 오류가 발생했습니다.") err = t("pay_records_error")
        else if (raw) err = String(data.msg)
        setError(err)
      }
    },
    [auth?.role, isManager, t, userStore]
  )

  const handleQuery = async () => {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    setSelectAll(false)
    try {
      await fetchPayrollRecords(monthStr, storeFilter)
      syncRecordsUrl(monthStr, storeFilter)
    } catch {
      setList([])
      setError(t("pay_error"))
    } finally {
      setLoading(false)
      setQueried(true)
    }
  }

  const pageActiveRef = useErpPageActiveRef()

  /**
   * 명세서 탭 마운트 시 URL(?tab=records&month=&store=)으로 폼·목록 복원.
   * searchParams는 deps에 넣지 않음 — 검색 후 router.replace 시 중복 조회 방지.
   */
  useEffect(() => {
    if (!pageActiveRef.current) return
    if (!auth?.store) return
    if (searchParams.get("tab") !== "records") return
    const m = searchParams.get("month")
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return
    const s = searchParams.get("store") || "All"
    const storeToUse = isManager && userStore ? userStore : s
    setMonthStr(m)
    setStoreFilter(storeToUse)
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setSelected(new Set())
      setSelectAll(false)
      try {
        await fetchPayrollRecords(m, storeToUse)
      } catch {
        if (!cancelled) {
          setList([])
          setError(t("pay_error"))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setQueried(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // searchParams는 deps에 넣지 않음 — 검색 후 router.replace 시 중복 조회 방지
  }, [auth?.store, fetchPayrollRecords, isManager, t, userStore, pageActiveRef])

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

  const handleExcelDownload = async () => {
    if (filteredList.length === 0) {
      await appAlert(t("pay_no_data"))
      return
    }
    const cols = [
      t("pay_month"),
      t("pay_col_store"),
      t("pay_col_name"),
      t("emp_label_employee_code"),
      t("pay_col_base"),
      t("pay_pos_allow"),
      t("pay_haz_allow"),
      t("pay_diligence_allow"),
      t("pay_birth"),
      t("pay_holiday"),
      t("pay_spl_bonus"),
      t("pay_ot"),
      t("pay_col_late"),
      t("pay_late_ded"),
      t("pay_sso"),
      t("pay_tax"),
      t("pay_other_ded"),
      t("pay_net"),
      t("wl_status"),
    ]
    const rows: string[][] = [cols]
    const sums = {
      salary: 0,
      pos: 0,
      haz: 0,
      dil: 0,
      birth: 0,
      hol: 0,
      spl: 0,
      ot: 0,
      lateDed: 0,
      sso: 0,
      tax: 0,
      other: 0,
      net: 0,
    }
    for (const r of filteredList) {
      const period = (r.month && /^\d{4}-\d{2}/.test(r.month) ? r.month.slice(0, 7) : monthStr) || monthStr
      const statusLabel =
        r.status === "확정"
          ? t("pay_status_confirmed")
          : r.status === "지급대기"
            ? t("pay_status_pending")
            : (r.status ?? t("pay_status_pending"))
      sums.salary += r.salary || 0
      sums.pos += r.pos_allow || 0
      sums.haz += r.haz_allow || 0
      sums.dil += r.diligence_allow || 0
      sums.birth += r.birth_bonus || 0
      sums.hol += r.holiday_pay || 0
      sums.spl += r.spl_bonus || 0
      sums.ot += r.ot_amt || 0
      sums.lateDed += r.late_ded || 0
      sums.sso += r.sso || 0
      sums.tax += r.tax || 0
      sums.other += r.other_ded || 0
      sums.net += r.net_pay || 0
      rows.push([
        period,
        r.store,
        r.name,
        String(r.employee_code || ""),
        String(r.salary ?? 0),
        String(r.pos_allow ?? 0),
        String(r.haz_allow ?? 0),
        String(r.diligence_allow ?? 0),
        String(r.birth_bonus ?? 0),
        String(r.holiday_pay ?? 0),
        String(r.spl_bonus ?? 0),
        String(r.ot_amt ?? 0),
        String(r.late_min ?? 0),
        String(r.late_ded ?? 0),
        String(r.sso ?? 0),
        String(r.tax ?? 0),
        String(r.other_ded ?? 0),
        String(r.net_pay ?? 0),
        statusLabel,
      ])
    }
    rows.push([
      "",
      "",
      t("pay_total_amount"),
      "",
      String(sums.salary),
      String(sums.pos),
      String(sums.haz),
      String(sums.dil),
      String(sums.birth),
      String(sums.hol),
      String(sums.spl),
      String(sums.ot),
      "",
      String(sums.lateDed),
      String(sums.sso),
      String(sums.tax),
      String(sums.other),
      String(sums.net),
      "",
    ])
    const pxPerChar = 8
    const minW = 56
    const colWidths = cols.map((_, c) => {
      let maxLen = (cols[c] || "").length
      for (const row of rows) {
        const cell = row[c]
        const len = String(cell ?? "").length
        if (len > maxLen) maxLen = len
      }
      return Math.max(minW, Math.min(maxLen * pxPerChar + 16, 220))
    })
    const tableBody = `<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
${rows.map((row, ri) => {
  const isHead = ri === 0
  const isTotal = ri === rows.length - 1
  const cls = isHead ? "head" : isTotal ? "total" : ""
  return `<tr${cls ? ` class="${cls}"` : ""}>${row.map((c) => `<td>${escapeXml(String(c ?? ""))}</td>`).join("")}</tr>`
}).join("")}
</table>`
    const html = buildErpExcelHtmlDocument(
      tableBody,
      erpExcelSimpleTableStyle({ withHead: true, withTotal: true })
    )
    triggerErpExcelHtmlDownload(html, `payroll_${monthStr}_${storeFilter === "All" ? "all" : storeFilter}.xls`)
  }

  const handleSendNotice = async () => {
    if (!monthStr) {
      await appAlert(t("pay_month_select"))
      return
    }
    const toSend = Array.from(selected).map((i) => filteredList[i])
    if (toSend.length === 0) {
      await appAlert(t("pay_notice_select_hint"))
      return
    }
    setSendingNotice(true)
    setError(null)
    try {
      // 직원 앱 공개 (published_at) — 실패 시 LINE/공지 보내지 않음(앱에서 안 보이는데 공지만 가는 것 방지)
      const pubRes = await apiFetch("/api/publishPayroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthStr,
          targets: toSend.map((r) => ({
            store: r.store,
            name: r.name,
            ...(r.employee_id != null && r.employee_id > 0 ? { employeeId: r.employee_id } : {}),
          })),
        }),
      })
      const pubBody = (await pubRes.json().catch(() => null)) as {
        success?: boolean
        msg?: string
        message?: string
      } | null
      if (!pubRes.ok || !pubBody?.success) {
        setError(
          String(pubBody?.msg || pubBody?.message || "").trim() || t("pay_publish_fail")
        )
        return
      }

      const targetStore = storeFilter === "All" ? "전체" : storeFilter
      const title = `${formatMonthLabel(monthStr)} 급여 명세서 등록`
      const content = `급여 명세서가 등록되었습니다.\n앱 홈 → [내 급여 명세서]에서 확인하세요.`
      const res = await sendNotice({
        title,
        content,
        targetStore,
        targetRole: "전체",
        targetRecipients: toSend.map((r) => ({
          store: r.store,
          name: r.name,
          ...(r.employee_id != null && r.employee_id > 0 ? { employeeId: r.employee_id } : {}),
        })),
        sender: auth?.user || "",
        userStore: auth?.store || "",
        userRole: auth?.role || "",
      })
      if (res.success) {
        await appAlert(t("noticeSentSuccess"))
        setSelected(new Set())
        setSelectAll(false)
        window.dispatchEvent(new CustomEvent("notice-sent"))
        void fetchPayrollRecords(monthStr, storeFilter)
      } else {
        setError(res.message || t("noticeSendFail"))
      }
    } catch {
      setError(t("noticeSendFail"))
    } finally {
      setSendingNotice(false)
    }
  }

  const handleUnpublish = async () => {
    if (!monthStr) {
      await appAlert(t("pay_month_select"))
      return
    }
    const toUnpub = Array.from(selected).map((i) => filteredList[i])
    if (toUnpub.length === 0) {
      await appAlert(t("pay_notice_select_hint"))
      return
    }
    if (!(await appConfirm(t("pay_unpublish_confirm")))) return
    setUnpublishing(true)
    setError(null)
    try {
      const res = await apiFetch("/api/publishPayroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthStr,
          mode: "unpublish",
          targets: toUnpub.map((r) => ({
            store: r.store,
            name: r.name,
            ...(r.employee_id != null && r.employee_id > 0 ? { employeeId: r.employee_id } : {}),
          })),
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        success?: boolean
        msg?: string
        message?: string
      } | null
      if (!res.ok || !body?.success) {
        setError(String(body?.msg || body?.message || "").trim() || t("pay_unpublish_fail"))
        return
      }
      await appAlert(t("pay_unpublish_success"))
      setSelected(new Set())
      setSelectAll(false)
      void fetchPayrollRecords(monthStr, storeFilter)
    } catch {
      setError(t("pay_unpublish_fail"))
    } finally {
      setUnpublishing(false)
    }
  }

  const hasResult = filteredList.length > 0

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
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => void handleExcelDownload()}
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                {t("pay_records_excel_download")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={handleSendNotice}
                disabled={sendingNotice || unpublishing || selected.size === 0}
              >
                <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                {sendingNotice ? t("loading") : t("pay_send_notice")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
                onClick={() => void handleUnpublish()}
                disabled={sendingNotice || unpublishing || selected.size === 0}
              >
                {unpublishing ? t("loading") : t("pay_unpublish")}
              </Button>
            </>
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
          <AdminTableScroll className="-mx-2" hint={false}>
            <table className="w-full text-sm border-collapse min-w-[900px]">
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
                  <th className="p-2 text-center font-medium">{t("emp_label_employee_code")}</th>
                  <th className="p-2 text-right font-medium">{t("pay_col_base")}</th>
                  <th className="p-2 text-right font-medium text-primary">{t("pay_allowance_sum")}</th>
                  <th className="p-2 text-right font-medium text-primary">{t("pay_ot_sum")}</th>
                  <th className="p-2 text-right font-medium text-destructive">{t("pay_deduct_sum")}</th>
                  <th className="p-2 text-right font-medium font-semibold">{t("pay_net")}</th>
                  <th className="p-2 text-center font-medium">{t("wl_status")}</th>
                  <th className="p-2 text-center font-medium whitespace-nowrap">{t("pay_records_verify_col")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((r, i) => {
                  const allowSum = sumAllowance(r)
                  const deductSum = sumDeduct(r)
                  const periodMonth = (r.month && /^\d{4}-\d{2}/.test(r.month) ? r.month.slice(0, 7) : monthStr) || monthStr
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
                      <td className="p-2 text-center whitespace-nowrap tabular-nums">{r.employee_code || "-"}</td>
                      <td className="p-2 text-right text-muted-foreground">{fmt(r.salary)}</td>
                      <td className="p-2 text-right text-primary">+{fmt(allowSum)}</td>
                      <td className="p-2 text-right text-primary">+{fmt(r.ot_amt || 0)}</td>
                      <td className="p-2 text-right text-destructive">-{fmt(deductSum)}</td>
                      <td className="p-2 text-right font-semibold bg-muted/30">{fmt(r.net_pay)}</td>
                      <td className="p-2 text-center space-y-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted block">
                          {r.status === "확정" ? t("pay_status_confirmed") : r.status === "지급대기" ? t("pay_status_pending") : (r.status ? r.status : t("pay_status_pending"))}
                        </span>
                        {r.published_at ? (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 block">
                            {t("pay_published")}
                          </span>
                        ) : (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 block">
                            {t("pay_unpublished")}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`${ADMIN_BTN_XS_CN} text-[10px]`}
                            >
                              {t("pay_records_verify_btn")}
                              <ChevronDown className="h-3 w-3 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem asChild className="text-xs cursor-pointer">
                              <Link className="flex items-center gap-2" href={payrollLeaveHref(periodMonth, r.store, r.name)}>
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                {t("pay_modal_link_leave")}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="text-xs cursor-pointer">
                              <Link className="flex items-center gap-2" href={payrollAttendanceHref(periodMonth, r.store, r.name)}>
                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                {t("pay_modal_link_attendance")}
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="mt-3 text-end font-bold text-base">
              {t("pay_total_amount")}: <span className="text-destructive">{fmt(totalAmount)}</span> THB
            </div>
          </AdminTableScroll>
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
