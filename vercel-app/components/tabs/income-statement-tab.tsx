"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight, ExternalLink, FileDown, Loader2, Search, Table } from "lucide-react"
import Link from "next/link"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  fetchIncomeStatementOverrides,
  getIncomeStatement,
  getIncomeStatementPurchaseDrillDown,
  saveIncomeStatementOverrides,
  useStoreList,
  type IncomeStatementData,
  type IncomeStatementPurchaseDrillDown,
} from "@/lib/api-client"
import { formatAccountSubjectLabel } from "@/lib/account-subject-display"
import { expandBangkokYearMonthsInclusive, getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  aggregateIncomeStatementByYear,
  FINANCIAL_COMPARE_MAX_MONTHS,
  incomeStatementCogs,
} from "@/lib/financial-statements-compare"
import { useAuth } from "@/lib/auth-context"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import {
  readIncomeStatementBeginningInvOverride,
  writeIncomeStatementBeginningInvOverride,
} from "@/lib/income-statement-beginning-inv-override"
import {
  readIncomeStatementOverrideSource,
  writeIncomeStatementOverrideSource,
  type IncomeStatementOverrideSource,
} from "@/lib/income-statement-override-source"
import {
  readIncomeStatementSalesOverride,
  writeIncomeStatementSalesOverride,
  parseSalesOverrideInput,
} from "@/lib/income-statement-sales-override"
import {
  downloadIncomeStatementXlsx,
  sanitizeFilenamePart,
  type IncomeStatementXlsxRow,
} from "@/lib/income-statement-export"

function purchaseVendorRowLabel(row: { key: string; label?: string }, t: (k: string) => string): string {
  if (row.key === '__pl_hq_orders__') return t('pL_purchaseHqOrders') || '본사·물류 발주'
  if (row.key === '__pl_vendor_unknown__') return t('pL_vendorUnknown') || '거래처 미지정'
  const n = String(row.label || '').trim()
  return n || row.key
}

function purchaseVendorLabelForKey(
  key: string,
  purchaseByVendor: IncomeStatementData['purchaseByVendor'] | undefined
): string | undefined {
  const row = purchaseByVendor?.find((r) => r.key === key)
  const n = String(row?.label || '').trim()
  return n || undefined
}

function purchaseAmountForVendor(data: IncomeStatementData | undefined, vendorKey: string): number {
  if (!data?.purchaseByVendor) return 0
  const r = data.purchaseByVendor.find((x) => x.key === vendorKey)
  return r ? Number(r.amount) || 0 : 0
}

function mergePurchaseVendorKeysForCompare(
  rows: { ym: string; data: IncomeStatementData }[]
): { key: string; label?: string }[] {
  const labelByKey = new Map<string, string | undefined>()
  for (const { data } of rows) {
    if (data.error) continue
    for (const r of data.purchaseByVendor || []) {
      if (!labelByKey.has(r.key)) {
        const lbl = String(r.label || '').trim()
        labelByKey.set(r.key, lbl || undefined)
      } else if (!labelByKey.get(r.key)) {
        const lbl = String(r.label || '').trim()
        if (lbl) labelByKey.set(r.key, lbl)
      }
    }
  }
  const keys = [...labelByKey.keys()]
  keys.sort((a, b) => {
    const ta = rows.reduce((s, x) => s + purchaseAmountForVendor(x.data, a), 0)
    const tb = rows.reduce((s, x) => s + purchaseAmountForVendor(x.data, b), 0)
    return tb - ta
  })
  return keys.map((key) => ({ key, label: labelByKey.get(key) }))
}

function expenseAmountForSubject(
  data: IncomeStatementData | undefined,
  accountSubjectId: number | null
): number {
  if (!data?.expenseByAccountSubject) return 0
  const r = data.expenseByAccountSubject.find((x) => x.accountSubjectId === accountSubjectId)
  return r ? Number(r.amount) || 0 : 0
}

function mergeExpenseSubjectsForCompare(rows: { data: IncomeStatementData }[]): {
  accountSubjectId: number | null
  code: string
  name: string
  nameEn: string | null
  nameTh: string | null
}[] {
  const metaByKey = new Map<
    string,
    {
      accountSubjectId: number | null
      code: string
      name: string
      nameEn: string | null
      nameTh: string | null
    }
  >()
  for (const { data } of rows) {
    if (data.error) continue
    for (const r of data.expenseByAccountSubject || []) {
      const k = r.accountSubjectId == null ? '__null__' : String(r.accountSubjectId)
      if (!metaByKey.has(k)) {
        metaByKey.set(k, {
          accountSubjectId: r.accountSubjectId,
          code: r.code,
          name: r.name,
          nameEn: r.nameEn,
          nameTh: r.nameTh,
        })
      }
    }
  }
  const list = [...metaByKey.values()]
  list.sort((a, b) => {
    const ta = rows.reduce((s, x) => s + expenseAmountForSubject(x.data, a.accountSubjectId), 0)
    const tb = rows.reduce((s, x) => s + expenseAmountForSubject(x.data, b.accountSubjectId), 0)
    return tb - ta
  })
  return list
}

function yearlyPurchaseVendorAmount(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  vendorKey: string
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += purchaseAmountForVendor(data, vendorKey)
  }
  return s
}

function yearlyExpenseSubjectAmount(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  accountSubjectId: number | null
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += expenseAmountForSubject(data, accountSubjectId)
  }
  return s
}

function yearlyExpenseBreakdownField(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  field: "pettyCash" | "bankWithdraw" | "fixedExpenses"
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += Number(data.expenseBreakdown?.[field]) || 0
  }
  return s
}

function IncomePurchaseDrillDialog({
  open,
  onOpenChange,
  purchaseDrillTitle,
  purchaseDrillLoading,
  purchaseDrillData,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseDrillTitle: string
  purchaseDrillLoading: boolean
  purchaseDrillData: IncomeStatementPurchaseDrillDown | null
  t: (k: string) => string
}) {
  const formatBath = (n: number) => `฿${(n ?? 0).toLocaleString()}`
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          // caller clears data/loading when closing
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("pL_purchaseDrillTitle")} — {purchaseDrillTitle}
          </DialogTitle>
          {purchaseDrillData && (
            <p className="text-xs text-muted-foreground font-normal">
              {purchaseDrillData.startStr} ~ {purchaseDrillData.endStr}
              {purchaseDrillData.storeFilter && purchaseDrillData.storeFilter !== "All"
                ? ` · ${purchaseDrillData.storeFilter}`
                : ""}
            </p>
          )}
        </DialogHeader>
        {purchaseDrillLoading && (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {t("pL_purchaseDrillLoading")}
          </div>
        )}
        {!purchaseDrillLoading && purchaseDrillData?.error && (
          <p className="text-sm text-destructive py-2">{purchaseDrillData.error}</p>
        )}
        {!purchaseDrillLoading && purchaseDrillData && !purchaseDrillData.error && (
          <div className="space-y-4 text-sm">
            {(purchaseDrillData.truncated.inbound ||
              purchaseDrillData.truncated.bank ||
              purchaseDrillData.truncated.orders) && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-md px-2 py-1.5">
                {t("pL_purchaseDrillTruncated")}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkOrders")}
              </Link>
              <Link
                href="/admin/bank-transactions"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkBank")}
              </Link>
              <Link
                href="/admin/inbound"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkInbound")}
              </Link>
            </div>

            {purchaseDrillData.isHqOrders && purchaseDrillData.hqOrders.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {t("pL_purchaseDrillHqOrders")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.hqOrders.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.orderDate}</td>
                          <td className="p-2 max-w-[140px] truncate">{r.storeName || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.total)}</td>
                          <td className="p-2">{r.status || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseDrillData.inbound.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {t("pL_purchaseDrillInbound")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColLoc")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColItem")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColQty")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColUnitCost")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.inbound.map((r, i) => (
                        <tr key={`${r.id ?? "x"}-${i}`} className="border-b border-border/60">
                          <td className="p-2 whitespace-nowrap">{r.logDate}</td>
                          <td className="p-2 max-w-[100px] truncate">{r.location}</td>
                          <td className="p-2 font-mono">{r.itemCode}</td>
                          <td className="p-2 text-right font-mono">{r.qty}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.unitCost)}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.lineAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseDrillData.bankPayments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {t("pL_purchaseDrillBank")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.bankPayments.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 max-w-[200px] truncate" title={r.memo || r.note || ""}>
                            {r.memo || r.note || "—"}
                          </td>
                          <td className="p-2 max-w-[100px] truncate">{r.store || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!(
              (purchaseDrillData.isHqOrders && purchaseDrillData.hqOrders.length > 0) ||
              purchaseDrillData.inbound.length > 0 ||
              purchaseDrillData.bankPayments.length > 0
            ) && (
              <p className="text-sm text-muted-foreground py-4">{t("pL_purchaseDrillEmpty")}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

type IncomeStatementViewModel = {
  sales: number
  grossProfit: number
  netProfit: number
  pct: (n: number) => string
  cogs: number
  beginningInventory: number
  expenses: number
  useManualSales: boolean
  systemSales: number
  useManualBegInv: boolean
  systemBeginningInventory: number
}

function IncomePlDetailTableContent({
  data,
  view,
  periodLine,
  showExpenseDetails,
  expandPurchases,
  onTogglePurchases,
  expandExpenseAccounts,
  onToggleExpenseAccounts,
  printRef,
  purchaseDrillContext,
  titleClassName = "text-lg font-semibold mb-1",
  wrapperClassName = "rounded-md bg-white p-3 text-foreground",
}: {
  data: IncomeStatementData
  view: IncomeStatementViewModel
  periodLine: string
  showExpenseDetails: boolean
  expandPurchases: boolean
  onTogglePurchases: () => void
  expandExpenseAccounts: boolean
  onToggleExpenseAccounts: () => void
  printRef?: React.RefObject<HTMLDivElement | null>
  /** 있으면 매입 거래처 행 클릭 시 해당 월·범위 상세 조회 */
  purchaseDrillContext?: {
    yearMonth: string
    storeFilter?: string
    userStore?: string
    userRole?: string
  } | null
  titleClassName?: string
  wrapperClassName?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const formatBath = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  const [purchaseDrillOpen, setPurchaseDrillOpen] = React.useState(false)
  const [purchaseDrillLoading, setPurchaseDrillLoading] = React.useState(false)
  const [purchaseDrillData, setPurchaseDrillData] = React.useState<IncomeStatementPurchaseDrillDown | null>(null)
  const [purchaseDrillTitle, setPurchaseDrillTitle] = React.useState("")

  const openPurchaseDrill = React.useCallback(
    (row: { key: string; label?: string }) => {
      if (!purchaseDrillContext?.yearMonth) return
      setPurchaseDrillTitle(purchaseVendorRowLabel(row, t))
      setPurchaseDrillOpen(true)
      setPurchaseDrillLoading(true)
      setPurchaseDrillData(null)
      getIncomeStatementPurchaseDrillDown({
        yearMonth: purchaseDrillContext.yearMonth,
        storeFilter: purchaseDrillContext.storeFilter,
        userStore: purchaseDrillContext.userStore,
        userRole: purchaseDrillContext.userRole,
        vendorKey: row.key,
      })
        .then((d) => setPurchaseDrillData(d))
        .finally(() => setPurchaseDrillLoading(false))
    },
    [purchaseDrillContext, t]
  )

  return (
    <div ref={printRef ?? undefined} className={wrapperClassName}>
      <div className={titleClassName}>{t("incomeStatementTitle")}</div>
      <div className="text-sm text-muted-foreground mb-2">{periodLine}</div>
      {view.useManualSales && (
        <div className="text-xs text-muted-foreground mb-2">
          {t("pL_systemSalesLabel")}: {formatBath(view.systemSales)}
        </div>
      )}
      {view.useManualBegInv && (
        <div className="text-xs text-muted-foreground mb-2">
          {t("pL_systemBegInvLabel")}: {formatBath(view.systemBeginningInventory)}
        </div>
      )}
      {showExpenseDetails && (data.diagnostics?.warnings?.length || 0) > 0 && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {data.diagnostics?.warnings?.join(" / ")}
        </div>
      )}
      {(data.diagnostics?.purchaseInboundBankOverlapVendorKeys?.length || 0) > 0 && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="mb-1.5 leading-relaxed">{t("pL_diagInboundBankOverlap")}</p>
          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
            {data.diagnostics!.purchaseInboundBankOverlapVendorKeys!.map((vk) => {
              const lbl = purchaseVendorLabelForKey(vk, data.purchaseByVendor)
              return (
                <li key={vk}>
                  {vk}
                  {lbl ? <span className="text-amber-950/80 font-sans not-italic"> — {lbl}</span> : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <table className="w-full max-w-md text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 text-left font-medium"></th>
            <th className="py-2 text-right font-medium pr-2">{t("pL_colAmount") || "금액"}</th>
            <th className="py-2 text-right font-medium w-14">{t("pL_pctOfSales")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2 font-medium">{t("pL_sales")}</td>
            <td className="py-2 text-right font-mono pr-2">{formatBath(view.sales)}</td>
            <td className="py-2 text-right text-muted-foreground">100.0%</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 text-muted-foreground pl-4">+ {t("pL_beginningInv")}</td>
            <td className="py-2 text-right font-mono text-muted-foreground pr-2">
              {formatBath(view.beginningInventory)}
            </td>
            <td className="py-2 text-right text-muted-foreground">{view.pct(view.beginningInventory)}</td>
          </tr>
          <tr
            className="border-b cursor-pointer hover:bg-muted/40 select-none"
            onClick={onTogglePurchases}
            title={t("pL_clickToExpand") || ""}
          >
            <td className="py-2 text-muted-foreground pl-4">
              <span className="inline-flex items-center gap-1">
                {expandPurchases ? (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                )}
                + {t("pL_purchases")}
              </span>
            </td>
            <td className="py-2 text-right font-mono text-muted-foreground pr-2">{formatBath(data.purchases)}</td>
            <td className="py-2 text-right text-muted-foreground">{view.pct(data.purchases)}</td>
          </tr>
          {expandPurchases &&
            (data.purchaseByVendor?.length || 0) > 0 &&
            data.purchaseByVendor!.map((row) => (
              <tr
                key={row.key}
                className={
                  purchaseDrillContext?.yearMonth
                    ? "border-b bg-muted/20 cursor-pointer hover:bg-muted/40"
                    : "border-b bg-muted/20"
                }
                onClick={purchaseDrillContext?.yearMonth ? () => openPurchaseDrill(row) : undefined}
                title={
                  purchaseDrillContext?.yearMonth ? t("pL_purchaseDrillClickHint") : undefined
                }
              >
                <td className="py-1.5 text-muted-foreground pl-10 text-xs">{purchaseVendorRowLabel(row, t)}</td>
                <td className="py-1.5 text-right font-mono text-muted-foreground pr-2 text-xs">
                  {formatBath(row.amount)}
                </td>
                <td className="py-1.5 text-right text-muted-foreground text-xs">{view.pct(row.amount)}</td>
              </tr>
            ))}
          {expandPurchases && !(data.purchaseByVendor?.length || 0) && (
            <tr className="border-b bg-muted/20">
              <td colSpan={3} className="py-2 pl-10 text-xs text-muted-foreground">
                {t("inNoData") || "조회된 내역이 없습니다."}
              </td>
            </tr>
          )}
          {expandPurchases && (
            <tr className="border-b bg-muted/10">
              <td colSpan={3} className="py-2 pl-6 pr-2 text-xs text-muted-foreground leading-relaxed">
                {t("pL_purchaseCompositionNote")}
              </td>
            </tr>
          )}
          <tr className="border-b">
            <td className="py-2 text-muted-foreground pl-4">- {t("pL_endingInv")}</td>
            <td className="py-2 text-right font-mono text-muted-foreground pr-2">
              {formatBath(data.endingInventory ?? 0)}
            </td>
            <td className="py-2 text-right text-muted-foreground">{view.pct(-(data.endingInventory ?? 0))}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 text-muted-foreground">= {t("pL_cogs")}</td>
            <td className="py-2 text-right font-mono text-muted-foreground pr-2">{formatBath(view.cogs)}</td>
            <td className="py-2 text-right text-muted-foreground">{view.pct(view.cogs)}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2 font-medium text-primary">{t("pL_grossProfit")}</td>
            <td className="py-2 text-right font-mono font-medium text-primary pr-2">
              {formatBath(view.grossProfit)}
            </td>
            <td className="py-2 text-right text-primary font-medium">{view.pct(view.grossProfit)}</td>
          </tr>
          <tr
            className="border-b cursor-pointer hover:bg-muted/40 select-none"
            onClick={onToggleExpenseAccounts}
            title={t("pL_clickToExpand") || ""}
          >
            <td className="py-2 text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {expandExpenseAccounts ? (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                )}
                - {t("pL_expenses")}
              </span>
            </td>
            <td className="py-2 text-right font-mono text-muted-foreground pr-2">{formatBath(data.expenses)}</td>
            <td className="py-2 text-right text-muted-foreground">{view.pct(data.expenses)}</td>
          </tr>
          {expandExpenseAccounts &&
            (data.expenseByAccountSubject?.length || 0) > 0 &&
            data.expenseByAccountSubject!.map((row, idx) => (
              <tr key={`${row.accountSubjectId ?? "u"}-${idx}`} className="border-b bg-muted/20">
                <td className="py-1.5 text-muted-foreground pl-10 text-xs">
                  {row.accountSubjectId == null
                    ? t("pL_accountUnclassified") || "계정 미지정"
                    : formatAccountSubjectLabel(lang, {
                        code: row.code,
                        name: row.name,
                        nameEn: row.nameEn,
                        nameTh: row.nameTh,
                      }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")}
                </td>
                <td className="py-1.5 text-right font-mono text-muted-foreground pr-2 text-xs">
                  {formatBath(row.amount)}
                </td>
                <td className="py-1.5 text-right text-muted-foreground text-xs">{view.pct(row.amount)}</td>
              </tr>
            ))}
          {expandExpenseAccounts && !(data.expenseByAccountSubject?.length || 0) && (
            <tr className="border-b bg-muted/20">
              <td colSpan={3} className="py-2 pl-10 text-xs text-muted-foreground">
                {t("inNoData") || "조회된 내역이 없습니다."}
              </td>
            </tr>
          )}
          {showExpenseDetails && (
            <>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground pl-4">- {t("pL_expenseSourcePetty") || "현금시재(패티캐시)"}</td>
                <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                  {formatBath(data.expenseBreakdown?.pettyCash ?? 0)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {view.pct(data.expenseBreakdown?.pettyCash ?? 0)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground pl-4">- {t("pL_expenseSourceBank") || "통장 출금"}</td>
                <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                  {formatBath(data.expenseBreakdown?.bankWithdraw ?? 0)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {view.pct(data.expenseBreakdown?.bankWithdraw ?? 0)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground pl-4">- {t("pL_expenseSourceFixed") || "고정비"}</td>
                <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                  {formatBath(data.expenseBreakdown?.fixedExpenses ?? 0)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {view.pct(data.expenseBreakdown?.fixedExpenses ?? 0)}
                </td>
              </tr>
            </>
          )}
          <tr>
            <td className="py-3 font-bold">{t("pL_netProfit")}</td>
            <td
              className={`py-3 text-right font-mono font-bold pr-2 ${
                view.netProfit >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {formatBath(view.netProfit)}
            </td>
            <td className={`py-3 text-right font-bold ${view.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
              {view.pct(view.netProfit)}
            </td>
          </tr>
        </tbody>
      </table>

      <IncomePurchaseDrillDialog
        open={purchaseDrillOpen}
        onOpenChange={(o) => {
          setPurchaseDrillOpen(o)
          if (!o) {
            setPurchaseDrillData(null)
            setPurchaseDrillLoading(false)
          }
        }}
        purchaseDrillTitle={purchaseDrillTitle}
        purchaseDrillLoading={purchaseDrillLoading}
        purchaseDrillData={purchaseDrillData}
        t={t}
      />
    </div>
  )
}

function incomeMetricsForCompare(d: IncomeStatementData | undefined) {
  if (!d || d.error) return null
  const sales = Number(d.sales) || 0
  const purchases = Number(d.purchases) || 0
  const expenses = Number(d.expenses) || 0
  const cogs = incomeStatementCogs(d)
  const grossProfit =
    d.grossProfit != null && Number.isFinite(Number(d.grossProfit))
      ? Number(d.grossProfit)
      : sales - cogs
  const netProfit =
    d.netProfit != null && Number.isFinite(Number(d.netProfit))
      ? Number(d.netProfit)
      : grossProfit - expenses
  return { sales, purchases, cogs, grossProfit, expenses, netProfit }
}

type IncomeStatementTabProps = {
  /** @deprecated 시작·종료월을 쓰세요. 있으면 시작=종료로 동기화 */
  yearMonth?: string
  yearMonthStart?: string
  yearMonthEnd?: string
  storeFilter?: string
  hideControls?: boolean
  queryToken?: number
}

export function IncomeStatementTab(props: IncomeStatementTabProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const defaultYm = props.yearMonth || getBangkokRecentYearMonths(1)[0]
  const [yearMonthStart, setYearMonthStart] = React.useState(
    () => props.yearMonthStart ?? props.yearMonth ?? defaultYm
  )
  const [yearMonthEnd, setYearMonthEnd] = React.useState(
    () => props.yearMonthEnd ?? props.yearMonth ?? defaultYm
  )
  const [storeFilter, setStoreFilter] = React.useState(() =>
    props.storeFilter ?? (isManager && managerStore ? managerStore : "All")
  )
  const [data, setData] = React.useState<IncomeStatementData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showExpenseDetails, setShowExpenseDetails] = React.useState(false)
  const [expandPurchases, setExpandPurchases] = React.useState(false)
  const [expandExpenseAccounts, setExpandExpenseAccounts] = React.useState(false)
  const [compareUnifiedExpandPurchases, setCompareUnifiedExpandPurchases] = React.useState(false)
  const [compareUnifiedExpandExpenses, setCompareUnifiedExpandExpenses] = React.useState(false)
  const [compareDrillOpen, setCompareDrillOpen] = React.useState(false)
  const [compareDrillLoading, setCompareDrillLoading] = React.useState(false)
  const [compareDrillData, setCompareDrillData] = React.useState<IncomeStatementPurchaseDrillDown | null>(null)
  const [compareDrillTitle, setCompareDrillTitle] = React.useState("")
  const [manualEnabled, setManualEnabled] = React.useState(false)
  const [manualAmountStr, setManualAmountStr] = React.useState("")
  const [begInvManualEnabled, setBegInvManualEnabled] = React.useState(false)
  const [begInvAmountStr, setBegInvAmountStr] = React.useState("")
  const [exportingPdf, setExportingPdf] = React.useState(false)
  const [overrideSource, setOverrideSource] = React.useState<IncomeStatementOverrideSource>(() =>
    readIncomeStatementOverrideSource()
  )
  const [sharedLoading, setSharedLoading] = React.useState(false)
  const [sharedReady, setSharedReady] = React.useState(false)
  const [sharedSaveError, setSharedSaveError] = React.useState<string | null>(null)

  const printRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (isManager && managerStore) {
      setStoreFilter(managerStore)
    }
  }, [isManager, managerStore])

  React.useEffect(() => {
    if (props.yearMonth) {
      setYearMonthStart(props.yearMonth)
      setYearMonthEnd(props.yearMonth)
    }
  }, [props.yearMonth])

  React.useEffect(() => {
    if (props.yearMonthStart) setYearMonthStart(props.yearMonthStart)
  }, [props.yearMonthStart])

  React.useEffect(() => {
    if (props.yearMonthEnd) setYearMonthEnd(props.yearMonthEnd)
  }, [props.yearMonthEnd])

  React.useEffect(() => {
    if (props.storeFilter) setStoreFilter(props.storeFilter)
  }, [props.storeFilter])

  React.useEffect(() => {
    setExpandPurchases(false)
    setExpandExpenseAccounts(false)
  }, [yearMonthStart, yearMonthEnd, storeFilter])

  React.useEffect(() => {
    writeIncomeStatementOverrideSource(overrideSource)
  }, [overrideSource])

  React.useEffect(() => {
    let cancelled = false
    if (overrideSource === "local") {
      setSharedLoading(false)
      setSharedReady(true)
      const s = readIncomeStatementSalesOverride(yearMonthEnd, storeFilter)
      if (s?.enabled) {
        setManualEnabled(true)
        setManualAmountStr(String(s.amount))
      } else {
        setManualEnabled(false)
        setManualAmountStr("")
      }
      const b = readIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter)
      if (b?.enabled) {
        setBegInvManualEnabled(true)
        setBegInvAmountStr(String(b.amount))
      } else {
        setBegInvManualEnabled(false)
        setBegInvAmountStr("")
      }
      return () => {
        cancelled = true
      }
    }

    setSharedReady(false)
    setSharedLoading(true)
    setSharedSaveError(null)

    void fetchIncomeStatementOverrides({
      yearMonth: yearMonthEnd,
      storeFilter,
      userStore: auth?.store,
      userRole: auth?.role,
    }).then((r) => {
      if (cancelled) return
      if (!r.success || !r.row) {
        setSharedSaveError(r.error || "LOAD_FAILED")
        setManualEnabled(false)
        setManualAmountStr("")
        setBegInvManualEnabled(false)
        setBegInvAmountStr("")
        setSharedLoading(false)
        setSharedReady(true)
        return
      }
      const row = r.row
      setManualEnabled(row.sales_override_enabled)
      setManualAmountStr(row.sales_override_enabled ? String(row.sales_override_amount) : "")
      setBegInvManualEnabled(row.beginning_inv_override_enabled)
      setBegInvAmountStr(
        row.beginning_inv_override_enabled ? String(row.beginning_inv_override_amount) : ""
      )
      setSharedLoading(false)
      setSharedReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [overrideSource, yearMonthEnd, storeFilter, auth?.store, auth?.role])

  React.useEffect(() => {
    if (overrideSource !== "local") return
    if (!manualEnabled) {
      writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, false, 0)
      return
    }
    const p = parseSalesOverrideInput(manualAmountStr)
    if (p == null) return
    writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, true, p)
  }, [overrideSource, yearMonthEnd, storeFilter, manualEnabled, manualAmountStr])

  React.useEffect(() => {
    if (overrideSource !== "local") return
    if (!begInvManualEnabled) {
      writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, false, 0)
      return
    }
    const p = parseSalesOverrideInput(begInvAmountStr)
    if (p == null) return
    writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, true, p)
  }, [overrideSource, yearMonthEnd, storeFilter, begInvManualEnabled, begInvAmountStr])

  React.useEffect(() => {
    if (overrideSource !== "shared" || !sharedReady || sharedLoading) return
    if (manualEnabled && parseSalesOverrideInput(manualAmountStr) == null) return
    if (begInvManualEnabled && parseSalesOverrideInput(begInvAmountStr) == null) return

    const salesAmt = parseSalesOverrideInput(manualAmountStr) ?? 0
    const begAmt = parseSalesOverrideInput(begInvAmountStr) ?? 0
    const salesOn = manualEnabled && parseSalesOverrideInput(manualAmountStr) != null
    const begOn = begInvManualEnabled && parseSalesOverrideInput(begInvAmountStr) != null

    const h = setTimeout(() => {
      void saveIncomeStatementOverrides({
        yearMonth: yearMonthEnd,
        storeFilter,
        userStore: auth?.store,
        userRole: auth?.role,
        updatedBy: auth?.user,
        salesOverrideEnabled: salesOn,
        salesOverrideAmount: salesOn ? salesAmt : 0,
        beginningInvOverrideEnabled: begOn,
        beginningInvOverrideAmount: begOn ? begAmt : 0,
      }).then((r) => {
        if (!r.success) setSharedSaveError(r.error || "SAVE_FAILED")
        else setSharedSaveError(null)
      })
    }, 750)
    return () => clearTimeout(h)
  }, [
    overrideSource,
    sharedReady,
    sharedLoading,
    yearMonthEnd,
    storeFilter,
    manualEnabled,
    manualAmountStr,
    begInvManualEnabled,
    begInvAmountStr,
    auth?.store,
    auth?.role,
    auth?.user,
  ])

  const periodMonthsFull = React.useMemo(
    () => expandBangkokYearMonthsInclusive(yearMonthStart, yearMonthEnd),
    [yearMonthStart, yearMonthEnd]
  )
  const periodMonths = React.useMemo(() => {
    if (periodMonthsFull.length <= FINANCIAL_COMPARE_MAX_MONTHS) return periodMonthsFull
    return periodMonthsFull.slice(-FINANCIAL_COMPARE_MAX_MONTHS)
  }, [periodMonthsFull])
  const periodRangeTruncated = periodMonthsFull.length > periodMonths.length
  const isRangeCompare = periodMonths.length > 1

  const [compareIncomeRows, setCompareIncomeRows] = React.useState<
    { ym: string; data: IncomeStatementData }[]
  >([])
  const [compareGranularity, setCompareGranularity] = React.useState<"month" | "year">("month")
  const [incomeCompareFetchId, setIncomeCompareFetchId] = React.useState(0)

  React.useEffect(() => {
    setCompareUnifiedExpandPurchases(false)
    setCompareUnifiedExpandExpenses(false)
  }, [incomeCompareFetchId])

  const runIncomeFetch = React.useCallback(() => {
    const sf = storeFilter !== "All" ? storeFilter : undefined
    const months = periodMonths

    if (months.length <= 1) {
      const ym = months[0] ?? yearMonthEnd
      setLoading(true)
      setCompareIncomeRows([])
      getIncomeStatement({
        yearMonth: ym,
        storeFilter: sf,
        userStore: auth?.store,
        userRole: auth?.role,
        includeDebug: showExpenseDetails,
      })
        .then((r) => setData(r))
        .catch(() => setData(null))
        .finally(() => setLoading(false))
      return
    }

    setLoading(true)
    setData(null)
    Promise.all(
      months.map((ym) =>
        getIncomeStatement({
          yearMonth: ym,
          storeFilter: sf,
          userStore: auth?.store,
          userRole: auth?.role,
          includeDebug: showExpenseDetails,
        })
      )
    )
      .then((arr) =>
        setCompareIncomeRows(
          months.map((ym, i) => ({
            ym,
            data: arr[i] as IncomeStatementData,
          }))
        )
      )
      .catch(() => setCompareIncomeRows([]))
      .finally(() => {
        setIncomeCompareFetchId((x) => x + 1)
        setLoading(false)
      })
  }, [
    periodMonths,
    storeFilter,
    auth?.store,
    auth?.role,
    showExpenseDetails,
    yearMonthEnd,
  ])

  React.useEffect(() => {
    if (!props.hideControls) return
    if (props.queryToken == null) return
    runIncomeFetch()
  }, [props.hideControls, props.queryToken, runIncomeFetch])

  const loadData = React.useCallback(() => {
    runIncomeFetch()
  }, [runIncomeFetch])

  const incomeYearCompare = React.useMemo(
    () => aggregateIncomeStatementByYear(compareIncomeRows),
    [compareIncomeRows]
  )

  const showIncomeCompareTable =
    isRangeCompare && !loading && compareIncomeRows.length > 0

  type IncomeCompareMetrics = NonNullable<ReturnType<typeof incomeMetricsForCompare>>

  const incomeComparePlRows = React.useMemo(
    () => [
      { key: "sales", label: t("pL_sales"), pick: (m: IncomeCompareMetrics) => m.sales },
      { key: "purchases", label: t("pL_purchases"), pick: (m: IncomeCompareMetrics) => m.purchases },
      { key: "cogs", label: t("pL_cogs"), pick: (m: IncomeCompareMetrics) => m.cogs },
      { key: "gross", label: t("pL_grossProfit"), pick: (m: IncomeCompareMetrics) => m.grossProfit },
      { key: "expenses", label: t("pL_expenses"), pick: (m: IncomeCompareMetrics) => m.expenses },
      { key: "net", label: t("pL_netProfit"), pick: (m: IncomeCompareMetrics) => m.netProfit },
    ],
    [t]
  )

  const incomeCompareCols = React.useMemo(() => {
    if (compareGranularity === "month") {
      return compareIncomeRows.map(({ ym, data }) => ({
        key: ym,
        label: ym,
        metrics: incomeMetricsForCompare(data),
      }))
    }
    return incomeYearCompare.map((y) => ({
      key: y.year,
      label: y.year,
      metrics: {
        sales: y.sales,
        purchases: y.purchases,
        cogs: y.cogs,
        grossProfit: y.grossProfit,
        expenses: y.expenses,
        netProfit: y.netProfit,
      } satisfies IncomeCompareMetrics,
    }))
  }, [compareGranularity, compareIncomeRows, incomeYearCompare])

  const compareMergedPurchaseVendors = React.useMemo(
    () => mergePurchaseVendorKeysForCompare(compareIncomeRows),
    [compareIncomeRows]
  )

  const compareMergedExpenseSubjects = React.useMemo(
    () => mergeExpenseSubjectsForCompare(compareIncomeRows),
    [compareIncomeRows]
  )

  const compareMergedOverlapKeys = React.useMemo(() => {
    const s = new Set<string>()
    for (const { data } of compareIncomeRows) {
      for (const k of data.diagnostics?.purchaseInboundBankOverlapVendorKeys || []) s.add(k)
    }
    return [...s].sort()
  }, [compareIncomeRows])

  const compareMergedWarnings = React.useMemo(() => {
    const lines = new Set<string>()
    for (const { data } of compareIncomeRows) {
      for (const w of data.diagnostics?.warnings || []) lines.add(w)
    }
    return [...lines]
  }, [compareIncomeRows])

  const openComparePurchaseDrill = React.useCallback(
    (ym: string, row: { key: string; label?: string }) => {
      setCompareDrillTitle(purchaseVendorRowLabel(row, t))
      setCompareDrillOpen(true)
      setCompareDrillLoading(true)
      setCompareDrillData(null)
      void getIncomeStatementPurchaseDrillDown({
        yearMonth: ym,
        storeFilter: storeFilter !== "All" ? storeFilter : undefined,
        userStore: auth?.store,
        userRole: auth?.role,
        vendorKey: row.key,
      })
        .then((d) => setCompareDrillData(d))
        .finally(() => setCompareDrillLoading(false))
    },
    [storeFilter, auth?.store, auth?.role, t]
  )

  const yearMonthOptions = getBangkokRecentYearMonths(60).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  const storeOptions = isOffice
    ? ["본사", ...(storeList || []).filter((s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office"))]
    : isManager && managerStore
      ? [managerStore]
      : []

  const formatBath = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  const view = React.useMemo(() => {
    if (!data) return null
    const expenses = data.expenses
    const purchases = data.purchases
    const endingInv = data.endingInventory ?? 0
    const sysBeg = data.beginningInventory ?? 0

    const parsedSales = parseSalesOverrideInput(manualAmountStr)
    const useManualSales = manualEnabled && parsedSales != null
    const sales = useManualSales ? parsedSales : data.sales

    const parsedBeg = parseSalesOverrideInput(begInvAmountStr)
    const useManualBegInv = begInvManualEnabled && parsedBeg != null
    const beginningInventory = useManualBegInv ? parsedBeg : sysBeg

    const cogs = beginningInventory + purchases - endingInv
    const grossProfit = sales - cogs
    const netProfit = grossProfit - expenses
    const pctBase = sales > 0 ? sales : 0
    const pct = (n: number) => (pctBase > 0 ? `${((n / pctBase) * 100).toFixed(1)}%` : "—")
    return {
      sales,
      grossProfit,
      netProfit,
      pct,
      cogs,
      beginningInventory,
      useManualSales,
      systemSales: data.sales,
      useManualBegInv,
      systemBeginningInventory: sysBeg,
      expenses,
    }
  }, [data, manualEnabled, manualAmountStr, begInvManualEnabled, begInvAmountStr])

  const storeLabel =
    storeFilter === "All"
      ? t("all") || "전체"
      : ["본사", "Office", "오피스", "본점"].includes(storeFilter) || storeFilter.toLowerCase().includes("office")
        ? t("pettyScopeOffice") || "본사"
        : storeFilter

  const buildXlsxRows = React.useCallback((): IncomeStatementXlsxRow[] => {
    if (!data || !view) return []
    const rows: IncomeStatementXlsxRow[] = []
    rows.push({ label: t("pL_sales"), amount: view.sales, pct: "100.0%" })
    rows.push({
      label: `  + ${t("pL_beginningInv")}`,
      amount: view.beginningInventory,
      pct: view.pct(view.beginningInventory),
    })
    rows.push({
      label: `  + ${t("pL_purchases")}`,
      amount: data.purchases,
      pct: view.pct(data.purchases),
    })
    if ((data.purchaseByVendor?.length || 0) > 0) {
      for (const row of data.purchaseByVendor!) {
        rows.push({
          label: `      ${purchaseVendorRowLabel(row, t)}`,
          amount: row.amount,
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `  - ${t("pL_endingInv")}`,
      amount: data.endingInventory ?? 0,
      pct: view.pct(-(data.endingInventory ?? 0)),
    })
    rows.push({
      label: `= ${t("pL_cogs")}`,
      amount: view.cogs,
      pct: view.pct(view.cogs),
    })
    rows.push({
      label: t("pL_grossProfit"),
      amount: view.grossProfit,
      pct: view.pct(view.grossProfit),
    })
    rows.push({
      label: `- ${t("pL_expenses")}`,
      amount: data.expenses,
      pct: view.pct(data.expenses),
    })
    if ((data.expenseByAccountSubject?.length || 0) > 0) {
      for (const row of data.expenseByAccountSubject!) {
        const label =
          row.accountSubjectId == null
            ? t("pL_accountUnclassified") || "계정 미지정"
            : formatAccountSubjectLabel(lang, {
                code: row.code,
                name: row.name,
                nameEn: row.nameEn,
                nameTh: row.nameTh,
              }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")
        rows.push({
          label: `      ${label}`,
          amount: row.amount,
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `    - ${t("pL_expenseSourcePetty") || "현금시재(패티캐시)"}`,
      amount: data.expenseBreakdown?.pettyCash ?? 0,
      pct: view.pct(data.expenseBreakdown?.pettyCash ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceBank") || "통장 출금"}`,
      amount: data.expenseBreakdown?.bankWithdraw ?? 0,
      pct: view.pct(data.expenseBreakdown?.bankWithdraw ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFixed") || "고정비"}`,
      amount: data.expenseBreakdown?.fixedExpenses ?? 0,
      pct: view.pct(data.expenseBreakdown?.fixedExpenses ?? 0),
    })
    rows.push({
      label: t("pL_netProfit"),
      amount: view.netProfit,
      pct: view.pct(view.netProfit),
    })
    return rows
  }, [data, view, lang, t])

  const handleDownloadXlsx = React.useCallback(() => {
    if (!data || !view) return
    const headerLines = [
      t("incomeStatementTitle"),
      `${data.yearMonth} · ${storeLabel}`,
      ...(view.useManualSales
        ? [`${t("pL_systemSalesLabel")}: ${formatBath(view.systemSales)}`]
        : []),
      ...(view.useManualBegInv
        ? [`${t("pL_systemBegInvLabel")}: ${formatBath(view.systemBeginningInventory)}`]
        : []),
    ]
    const fname = `income-statement-${sanitizeFilenamePart(data.yearMonth)}-${sanitizeFilenamePart(storeFilter)}.xlsx`
    downloadIncomeStatementXlsx(fname, headerLines, [t("pL_colItem"), t("pL_colAmount") || "금액", t("pL_pctOfSales")], buildXlsxRows())
  }, [data, view, storeLabel, storeFilter, t, buildXlsxRows])

  const handleDownloadPdf = React.useCallback(async () => {
    const el = printRef.current
    if (!el || !data || !view) return
    setExportingPdf(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 10
      const imgW = pageW - margin * 2
      const imgH = (canvas.height * imgW) / canvas.width
      const usableH = pageH - margin * 2
      let heightLeft = imgH
      let y = margin
      pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
      heightLeft -= usableH
      while (heightLeft > 0) {
        y = margin - (imgH - heightLeft)
        pdf.addPage()
        pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
        heightLeft -= usableH
      }
      const fname = `income-statement-${sanitizeFilenamePart(data.yearMonth)}-${sanitizeFilenamePart(storeFilter)}.pdf`
      pdf.save(fname)
    } finally {
      setExportingPdf(false)
    }
  }, [data, view, storeFilter])

  const onManualCheckedChange = (checked: boolean) => {
    setManualEnabled(checked)
    if (checked && data) {
      if (overrideSource === "local") {
        const saved = readIncomeStatementSalesOverride(yearMonthEnd, storeFilter)
        setManualAmountStr(saved?.enabled ? String(saved.amount) : String(data.sales))
      } else {
        const p = parseSalesOverrideInput(manualAmountStr)
        setManualAmountStr(p != null ? String(p) : String(data.sales))
      }
    }
    if (!checked) {
      setManualAmountStr("")
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {!props.hideControls && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("fs_periodStartMonth")}
                  </span>
                  <Select
                    value={yearMonthStart}
                    onValueChange={(v) => {
                      setYearMonthStart(v)
                      if (v > yearMonthEnd) setYearMonthEnd(v)
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder={t("fs_periodStartMonth")} />
                    </SelectTrigger>
                    <SelectContent>
                      {yearMonthOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground shrink-0">~</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("fs_periodEndMonth")}
                  </span>
                  <Select
                    value={yearMonthEnd}
                    onValueChange={(v) => {
                      setYearMonthEnd(v)
                      if (v < yearMonthStart) setYearMonthStart(v)
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder={t("fs_periodEndMonth")} />
                    </SelectTrigger>
                    <SelectContent>
                      {yearMonthOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              </>
            )}
            <Button
              size="sm"
              variant={showExpenseDetails ? "default" : "outline"}
              onClick={() => setShowExpenseDetails((v) => !v)}
            >
              {showExpenseDetails ? t("pL_expenseDetailOn") : t("pL_expenseDetailOff")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || !view || loading || isRangeCompare}
              title={isRangeCompare ? t("fs_multiPeriodExportsNote") : undefined}
              onClick={handleDownloadXlsx}
            >
              <Table className="h-4 w-4 mr-1" />
              {t("pL_exportXlsx")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || !view || loading || exportingPdf || isRangeCompare}
              title={isRangeCompare ? t("fs_multiPeriodExportsNote") : undefined}
              onClick={() => void handleDownloadPdf()}
            >
              <FileDown className="h-4 w-4 mr-1" />
              {exportingPdf ? t("pL_exportBusy") : t("pL_exportPdf")}
            </Button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("loadingItems") || "불러오는 중..."}
            </p>
          ) : (
            <>
              {showIncomeCompareTable && (
                <div className="mb-6 space-y-3">
                  {periodRangeTruncated && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      {t("fs_periodTruncated").replace("{n}", String(FINANCIAL_COMPARE_MAX_MONTHS))}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant={compareGranularity === "month" ? "default" : "outline"}
                      onClick={() => setCompareGranularity("month")}
                    >
                      {t("fs_compareByMonth")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={compareGranularity === "year" ? "default" : "outline"}
                      onClick={() => setCompareGranularity("year")}
                    >
                      {t("fs_compareByYear")}
                    </Button>
                  </div>
                  {compareGranularity === "year" && (
                    <p className="text-xs text-muted-foreground">{t("fs_compareYearPlNote")}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {yearMonthStart === yearMonthEnd
                      ? yearMonthEnd
                      : `${yearMonthStart} ~ ${yearMonthEnd}`}{" "}
                    · {storeLabel}
                  </div>
                  {incomeCompareCols.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t("inNoData") || "조회된 내역이 없습니다."}
                    </p>
                  ) : (
                    <>
                      {showExpenseDetails && compareMergedWarnings.length > 0 && (
                        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {compareMergedWarnings.join(" / ")}
                        </div>
                      )}
                      {compareMergedOverlapKeys.length > 0 && (
                        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <p className="mb-1.5 leading-relaxed">{t("pL_diagInboundBankOverlap")}</p>
                          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                            {compareMergedOverlapKeys.map((vk) => {
                              let lbl: string | undefined
                              for (const { data } of compareIncomeRows) {
                                lbl = purchaseVendorLabelForKey(vk, data.purchaseByVendor)
                                if (lbl) break
                              }
                              return (
                                <li key={vk}>
                                  {vk}
                                  {lbl ? (
                                    <span className="text-amber-950/80 font-sans not-italic"> — {lbl}</span>
                                  ) : null}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                      {compareGranularity === "year" && (
                        <p className="text-xs text-muted-foreground">{t("fs_compareYearOnlySummaryNote")}</p>
                      )}
                      <div className="overflow-x-auto rounded-md border">
                        <table className="text-sm w-full min-w-max">
                          <caption className="caption-top text-left text-sm font-semibold text-foreground py-2 px-2 border-b border-border">
                            {t("incomeStatementTitle")}
                          </caption>
                          <thead>
                            <tr className="border-b bg-muted/40">
                              <th className="text-left p-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[160px]">
                                {t("pL_colItem")}
                              </th>
                              {incomeCompareCols.map((c) => (
                                <th
                                  key={c.key}
                                  className="text-right p-2 font-medium font-mono whitespace-nowrap"
                                >
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {compareGranularity === "year" ? (
                              <>
                                {incomeComparePlRows.map((row) => (
                                  <React.Fragment key={row.key}>
                                    <tr
                                      className={`border-b last:border-0 ${
                                        row.key === "purchases" || row.key === "expenses"
                                          ? "cursor-pointer hover:bg-muted/40 select-none"
                                          : ""
                                      }`}
                                      onClick={
                                        row.key === "purchases"
                                          ? () => setCompareUnifiedExpandPurchases((v) => !v)
                                          : row.key === "expenses"
                                            ? () => setCompareUnifiedExpandExpenses((v) => !v)
                                            : undefined
                                      }
                                    >
                                      <td className="p-2 font-medium sticky left-0 bg-background z-10">
                                        {row.key === "purchases" || row.key === "expenses" ? (
                                          <span className="inline-flex items-center gap-1">
                                            {row.key === "purchases" ? (
                                              compareUnifiedExpandPurchases ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                              )
                                            ) : compareUnifiedExpandExpenses ? (
                                              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                            )}
                                            {row.label}
                                          </span>
                                        ) : (
                                          row.label
                                        )}
                                      </td>
                                      {incomeCompareCols.map((c) => {
                                        const m = c.metrics
                                        const v = m ? row.pick(m) : null
                                        const isNet = row.key === "net"
                                        return (
                                          <td
                                            key={c.key}
                                            className={`p-2 text-right font-mono whitespace-nowrap ${
                                              isNet && v != null && v < 0 ? "text-destructive" : ""
                                            } ${isNet && v != null && v >= 0 ? "font-semibold text-primary" : ""}`}
                                          >
                                            {v == null || m == null ? "—" : formatBath(v)}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                    {row.key === "purchases" &&
                                      compareUnifiedExpandPurchases &&
                                      compareMergedPurchaseVendors.map((pv) => (
                                        <tr
                                          key={`y-pv-${pv.key}`}
                                          className="border-b bg-muted/10 last:border-0"
                                        >
                                          <td className="p-1.5 pl-10 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                            {purchaseVendorRowLabel(pv, t)}
                                          </td>
                                          {incomeCompareCols.map((c) => (
                                            <td
                                              key={c.key}
                                              className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                              title={t("fs_compareYearAggregateHint")}
                                            >
                                              {formatBath(
                                                yearlyPurchaseVendorAmount(compareIncomeRows, c.key, pv.key)
                                              )}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    {row.key === "purchases" && compareUnifiedExpandPurchases && (
                                      <tr className="border-b bg-muted/10 last:border-0">
                                        <td
                                          colSpan={incomeCompareCols.length + 1}
                                          className="py-2 pl-6 pr-2 text-xs text-muted-foreground leading-relaxed"
                                        >
                                          {t("pL_purchaseCompositionNote")}
                                        </td>
                                      </tr>
                                    )}
                                    {row.key === "expenses" &&
                                      compareUnifiedExpandExpenses &&
                                      compareMergedExpenseSubjects.map((sub) => (
                                        <tr
                                          key={`y-es-${sub.accountSubjectId ?? "u"}`}
                                          className="border-b bg-muted/10 last:border-0"
                                        >
                                          <td className="p-1.5 pl-10 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                            {sub.accountSubjectId == null
                                              ? t("pL_accountUnclassified") || "계정 미지정"
                                              : formatAccountSubjectLabel(lang, {
                                                  code: sub.code,
                                                  name: sub.name,
                                                  nameEn: sub.nameEn,
                                                  nameTh: sub.nameTh,
                                                }) ||
                                                (sub.accountSubjectId != null
                                                  ? `#${sub.accountSubjectId}`
                                                  : "")}
                                          </td>
                                          {incomeCompareCols.map((c) => (
                                            <td
                                              key={c.key}
                                              className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                              title={t("fs_compareYearAggregateHint")}
                                            >
                                              {formatBath(
                                                yearlyExpenseSubjectAmount(
                                                  compareIncomeRows,
                                                  c.key,
                                                  sub.accountSubjectId
                                                )
                                              )}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    {row.key === "expenses" &&
                                      compareUnifiedExpandExpenses &&
                                      showExpenseDetails && (
                                        <>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                              - {t("pL_expenseSourcePetty")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "pettyCash"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                              - {t("pL_expenseSourceBank")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "bankWithdraw"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                              - {t("pL_expenseSourceFixed")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "fixedExpenses"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                        </>
                                      )}
                                  </React.Fragment>
                                ))}
                              </>
                            ) : (
                              <>
                                <tr className="border-b">
                                  <td className="p-2 font-medium sticky left-0 bg-background z-10">
                                    {t("pL_sales")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono whitespace-nowrap"
                                    >
                                      {rowData.error ? "—" : formatBath(Number(rowData.sales) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                <tr className="border-b">
                                  <td className="p-2 text-muted-foreground pl-4 sticky left-0 bg-background z-10">
                                    + {t("pL_beginningInv")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error
                                        ? "—"
                                        : formatBath(Number(rowData.beginningInventory) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                <tr
                                  className="border-b cursor-pointer hover:bg-muted/40 select-none"
                                  onClick={() => setCompareUnifiedExpandPurchases((v) => !v)}
                                >
                                  <td className="p-2 text-muted-foreground pl-4 sticky left-0 bg-background z-10">
                                    <span className="inline-flex items-center gap-1">
                                      {compareUnifiedExpandPurchases ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                      )}
                                      + {t("pL_purchases")}
                                    </span>
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error ? "—" : formatBath(Number(rowData.purchases) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                {compareUnifiedExpandPurchases &&
                                  compareMergedPurchaseVendors.map((pv) => (
                                    <tr key={pv.key} className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-10 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                        {purchaseVendorRowLabel(pv, t)}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => {
                                        const amt = purchaseAmountForVendor(rowData, pv.key)
                                        const canDrill = !rowData.error && amt > 0
                                        return (
                                          <td
                                            key={ym}
                                            className={`p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap ${
                                              canDrill ? "cursor-pointer hover:bg-muted/50 underline-offset-2" : ""
                                            }`}
                                            title={canDrill ? t("pL_purchaseDrillClickHint") : undefined}
                                            onClick={
                                              canDrill
                                                ? (e) => {
                                                    e.stopPropagation()
                                                    openComparePurchaseDrill(ym, pv)
                                                  }
                                                : undefined
                                            }
                                          >
                                            {rowData.error ? "—" : formatBath(amt)}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                {compareUnifiedExpandPurchases && (
                                  <tr className="border-b bg-muted/10">
                                    <td
                                      colSpan={compareIncomeRows.length + 1}
                                      className="py-2 pl-6 pr-2 text-xs text-muted-foreground leading-relaxed"
                                    >
                                      {t("pL_purchaseCompositionNote")}
                                    </td>
                                  </tr>
                                )}
                                <tr className="border-b">
                                  <td className="p-2 text-muted-foreground pl-4 sticky left-0 bg-background z-10">
                                    - {t("pL_endingInv")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error
                                        ? "—"
                                        : formatBath(Number(rowData.endingInventory) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                <tr className="border-b">
                                  <td className="p-2 text-muted-foreground sticky left-0 bg-background z-10">
                                    = {t("pL_cogs")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error ? "—" : formatBath(incomeStatementCogs(rowData))}
                                    </td>
                                  ))}
                                </tr>
                                <tr className="border-b">
                                  <td className="p-2 font-medium text-primary sticky left-0 bg-background z-10">
                                    {t("pL_grossProfit")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => {
                                    const m = incomeMetricsForCompare(rowData)
                                    const v = m?.grossProfit ?? null
                                    return (
                                      <td
                                        key={ym}
                                        className={`p-2 text-right font-mono font-medium whitespace-nowrap ${
                                          v != null && v < 0 ? "text-destructive" : "text-primary"
                                        }`}
                                      >
                                        {v == null ? "—" : formatBath(v)}
                                      </td>
                                    )
                                  })}
                                </tr>
                                <tr
                                  className="border-b cursor-pointer hover:bg-muted/40 select-none"
                                  onClick={() => setCompareUnifiedExpandExpenses((v) => !v)}
                                >
                                  <td className="p-2 text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="inline-flex items-center gap-1">
                                      {compareUnifiedExpandExpenses ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                      )}
                                      - {t("pL_expenses")}
                                    </span>
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error ? "—" : formatBath(Number(rowData.expenses) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                {compareUnifiedExpandExpenses &&
                                  compareMergedExpenseSubjects.map((sub) => (
                                    <tr key={String(sub.accountSubjectId ?? "u")} className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-10 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                        {sub.accountSubjectId == null
                                          ? t("pL_accountUnclassified") || "계정 미지정"
                                          : formatAccountSubjectLabel(lang, {
                                              code: sub.code,
                                              name: sub.name,
                                              nameEn: sub.nameEn,
                                              nameTh: sub.nameTh,
                                            }) ||
                                            (sub.accountSubjectId != null
                                              ? `#${sub.accountSubjectId}`
                                              : "")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(
                                                expenseAmountForSubject(rowData, sub.accountSubjectId)
                                              )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                {compareUnifiedExpandExpenses && showExpenseDetails && (
                                  <>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                        - {t("pL_expenseSourcePetty")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.pettyCash ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                        - {t("pL_expenseSourceBank")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.bankWithdraw ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                        - {t("pL_expenseSourceFixed")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.fixedExpenses ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                  </>
                                )}
                                <tr className="border-b last:border-0">
                                  <td className="p-2 font-bold sticky left-0 bg-background z-10">
                                    {t("pL_netProfit")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => {
                                    const m = incomeMetricsForCompare(rowData)
                                    const v = m?.netProfit ?? null
                                    return (
                                      <td
                                        key={ym}
                                        className={`p-2 text-right font-mono font-bold whitespace-nowrap ${
                                          v != null && v < 0 ? "text-destructive" : ""
                                        } ${v != null && v >= 0 ? "text-primary" : ""}`}
                                      >
                                        {v == null ? "—" : formatBath(v)}
                                      </td>
                                    )
                                  })}
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <IncomePurchaseDrillDialog
                        open={compareDrillOpen}
                        onOpenChange={(o) => {
                          setCompareDrillOpen(o)
                          if (!o) {
                            setCompareDrillData(null)
                            setCompareDrillLoading(false)
                          }
                        }}
                        purchaseDrillTitle={compareDrillTitle}
                        purchaseDrillLoading={compareDrillLoading}
                        purchaseDrillData={compareDrillData}
                        t={t}
                      />
                    </>
                  )}
                </div>
              )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId > 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("inNoData") || "조회된 내역이 없습니다."}
                  </p>
                )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId === 0 &&
                !props.hideControls && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("msg_click_query") || "조회 버튼을 눌러 주세요."}
                  </p>
                )}
              {!isRangeCompare && (
                <div className="space-y-3 mb-4 pb-4 border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">{t("pL_overrideStorageLabel")}</span>
                    <Select
                      value={overrideSource}
                      onValueChange={(v) => setOverrideSource(v as IncomeStatementOverrideSource)}
                      disabled={sharedLoading}
                    >
                      <SelectTrigger className="w-[220px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">{t("pL_overrideSourceLocal")}</SelectItem>
                        <SelectItem value="shared">{t("pL_overrideSourceShared")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {overrideSource === "shared" && sharedLoading && (
                      <span className="text-xs text-muted-foreground">{t("pL_overrideSharedLoading")}</span>
                    )}
                    {overrideSource === "shared" && sharedSaveError && !sharedLoading && (
                      <span className="text-xs text-destructive">{t("pL_overrideSharedErr")}: {sharedSaveError}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-3xl">{t("pL_overrideStorageNote")}</p>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pl-manual-sales"
                        checked={manualEnabled}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                        onCheckedChange={(v) => onManualCheckedChange(v === true)}
                      />
                      <Label htmlFor="pl-manual-sales" className="text-sm font-normal cursor-pointer">
                        {t("pL_manualSalesUse")}
                      </Label>
                    </div>
                    {manualEnabled && (
                      <Input
                        className="w-40 h-9 font-mono"
                        inputMode="decimal"
                        placeholder={t("pL_manualSalesPlaceholder")}
                        value={manualAmountStr}
                        onChange={(e) => setManualAmountStr(e.target.value)}
                        aria-label={t("pL_manualSalesPlaceholder")}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                      />
                    )}
                    <p className="text-xs text-muted-foreground max-w-md shrink-0">
                      {overrideSource === "local" ? t("pL_manualSalesNote") : t("pL_manualSalesNoteShared")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pl-manual-beg-inv"
                        checked={begInvManualEnabled}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                        onCheckedChange={(v) => {
                          const checked = v === true
                          setBegInvManualEnabled(checked)
                          if (checked) {
                            if (overrideSource === "local") {
                              const saved = readIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter)
                              if (saved?.enabled) setBegInvAmountStr(String(saved.amount))
                              else if (data) setBegInvAmountStr(String(data.beginningInventory ?? 0))
                              else setBegInvAmountStr("")
                            } else {
                              const p = parseSalesOverrideInput(begInvAmountStr)
                              if (p != null) setBegInvAmountStr(String(p))
                              else if (data) setBegInvAmountStr(String(data.beginningInventory ?? 0))
                              else setBegInvAmountStr("")
                            }
                          } else setBegInvAmountStr("")
                        }}
                      />
                      <Label htmlFor="pl-manual-beg-inv" className="text-sm font-normal cursor-pointer">
                        {t("pL_manualBegInvUse")}
                      </Label>
                    </div>
                    {begInvManualEnabled && (
                      <Input
                        className="w-40 h-9 font-mono"
                        inputMode="decimal"
                        placeholder={t("pL_manualBegInvPlaceholder")}
                        value={begInvAmountStr}
                        onChange={(e) => setBegInvAmountStr(e.target.value)}
                        aria-label={t("pL_manualBegInvPlaceholder")}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                      />
                    )}
                    <p className="text-xs text-muted-foreground max-w-xl">
                      {overrideSource === "local" ? t("pL_manualBegInvNote") : t("pL_manualBegInvNoteShared")}
                    </p>
                  </div>
                  {!data && (
                    <p className="text-xs text-muted-foreground">{t("pL_manualOverridesAfterQuery")}</p>
                  )}
                </div>
              )}

              {!isRangeCompare && data && view ? (
                <div className="overflow-x-auto">
                  <IncomePlDetailTableContent
                    data={data}
                    view={view}
                    periodLine={`${data.yearMonth} · ${storeLabel}`}
                    showExpenseDetails={showExpenseDetails}
                    expandPurchases={expandPurchases}
                    onTogglePurchases={() => setExpandPurchases((v) => !v)}
                    expandExpenseAccounts={expandExpenseAccounts}
                    onToggleExpenseAccounts={() => setExpandExpenseAccounts((v) => !v)}
                    printRef={printRef}
                    purchaseDrillContext={{
                      yearMonth: data.yearMonth,
                      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
                      userStore: auth?.store,
                      userRole: auth?.role,
                    }}
                  />
                </div>
              ) : !isRangeCompare ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("msg_click_query") || "조회 버튼을 눌러 주세요."}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
