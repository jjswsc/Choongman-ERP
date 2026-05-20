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
  getIncomeStatementExpenseDrillDown,
  getIncomeStatementPurchaseDrillDown,
  isIncomeStatementData,
  saveIncomeStatementOverrides,
  useStoreList,
  type IncomeStatementData,
  type IncomeStatementExpenseDrillDown,
  type IncomeStatementPurchaseDrillDown,
} from "@/lib/api-client"
import { formatAccountSubjectLabel } from "@/lib/account-subject-display"
import { expandBangkokYearMonthsInclusive, getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  aggregateIncomeStatementByYear,
  FINANCIAL_COMPARE_MAX_MONTHS,
  incomeStatementCogs,
} from "@/lib/financial-statements-compare"
import { isMaterialHqOutboundOrderDiff } from "@/lib/income-statement-hq-diff"
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
import { formatBahtInteger as formatBath, roundFinancialAmount } from "@/lib/financial-amount-format"
import {
  buildExpenseDrillAdminHref,
  buildPurchaseDrillAdminHref,
  expenseDrillNavContextFromDrill,
  purchaseDrillNavContextFromDrill,
} from "@/lib/income-statement-purchase-drill-nav"

function purchaseVendorRowLabel(row: { key: string; label?: string }, t: (k: string) => string): string {
  if (row.key === '__pl_hq_orders__') return t('pL_purchaseHqOrders') || '본사 창고 출고(매입)'
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

function salesCustomerRowLabel(row: { key: string; label?: string }, t: (k: string) => string): string {
  if (row.key === "__pl_sales_customer_unknown__") return t("pL_salesCustomerUnknown") || "Unspecified customer"
  const n = String(row.label || "").trim()
  return n || row.key
}

function salesAmountForCustomer(data: IncomeStatementData | undefined, customerKey: string): number {
  if (!data?.salesByCustomer) return 0
  const r = data.salesByCustomer.find((x) => x.key === customerKey)
  return r ? Number(r.amount) || 0 : 0
}

function mergeSalesCustomerKeysForCompare(
  rows: { ym: string; data: IncomeStatementData }[]
): { key: string; label?: string }[] {
  const labelByKey = new Map<string, string | undefined>()
  for (const { data } of rows) {
    if (data.error) continue
    for (const r of data.salesByCustomer || []) {
      if (!labelByKey.has(r.key)) {
        const lbl = String(r.label || "").trim()
        labelByKey.set(r.key, lbl || undefined)
      } else if (!labelByKey.get(r.key)) {
        const lbl = String(r.label || "").trim()
        if (lbl) labelByKey.set(r.key, lbl)
      }
    }
  }
  const keys = [...labelByKey.keys()]
  keys.sort((a, b) => {
    const ta = rows.reduce((s, x) => s + salesAmountForCustomer(x.data, a), 0)
    const tb = rows.reduce((s, x) => s + salesAmountForCustomer(x.data, b), 0)
    return tb - ta
  })
  return keys.map((key) => ({ key, label: labelByKey.get(key) }))
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

function yearlySalesCustomerAmount(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  customerKey: string
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += salesAmountForCustomer(data, customerKey)
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
  const drillNavCtx =
    purchaseDrillData && !purchaseDrillData.error
      ? purchaseDrillNavContextFromDrill(purchaseDrillData, purchaseDrillTitle)
      : null

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
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/outbound", drillNavCtx, "outbound")
                    : "/admin/outbound"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkOutbound")}
              </Link>
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkOrders")}
              </Link>
              <Link
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/bank-transactions", drillNavCtx, "bank")
                    : "/admin/bank-transactions"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkBank")}
              </Link>
              <Link
                href={
                  drillNavCtx
                    ? buildPurchaseDrillAdminHref("/admin/inbound", drillNavCtx, "inbound")
                    : "/admin/inbound"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_purchaseDrillLinkInbound")}
              </Link>
            </div>

            {purchaseDrillData.isHqOrders && (purchaseDrillData.hqOutbounds?.length || 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {t("pL_purchaseDrillHqOutbound")}
                </p>
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStatus")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColItem")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColQty")}</th>
                        <th className="text-right p-2">{t("pL_purchaseDrillColUnitCost")}</th>
                        <th className="text-right p-2">{t("pL_colAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseDrillData.hqOutbounds!.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.logDate}</td>
                          <td className="p-2">{r.logType || "—"}</td>
                          <td className="p-2 max-w-[120px] truncate">{r.targetStore || "—"}</td>
                          <td className="p-2 font-mono">{r.itemCode}</td>
                          <td className="p-2 text-right font-mono">{r.qty}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.unitPrice)}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.lineAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {purchaseDrillData.isHqOrders && (purchaseDrillData.hqOrders?.length || 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">
                  {t("pL_purchaseDrillHqOrdersRef")}
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
                      {purchaseDrillData.hqOrders!.map((r) => (
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
                        <th className="text-left p-2">{t("pL_purchaseDrillBankOrderRef")}</th>
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
                          <td className="p-2 font-mono whitespace-nowrap">
                            {String(r.refType || "").toLowerCase() === "order" && r.refId ? (
                              <Link
                                href="/admin/orders"
                                className="text-primary underline underline-offset-2 hover:text-primary/90"
                                title={t("pL_purchaseDrillBankOrderRefHint")}
                              >
                                #{r.refId}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
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
              (purchaseDrillData.isHqOrders && (purchaseDrillData.hqOutbounds?.length || 0) > 0) ||
              (purchaseDrillData.isHqOrders && (purchaseDrillData.hqOrders?.length || 0) > 0) ||
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

function expenseAccountRowLabel(
  row: NonNullable<IncomeStatementData["expenseByAccountSubject"]>[number],
  t: (k: string) => string,
  lang: string
): string {
  if (row.accountSubjectId == null) {
    return t("pL_accountUnclassified") || "Unclassified account"
  }
  return (
    formatAccountSubjectLabel(lang, {
      code: row.code,
      name: row.name,
      nameEn: row.nameEn,
      nameTh: row.nameTh,
    }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")
  )
}

function IncomeExpenseDrillDialog({
  open,
  onOpenChange,
  expenseDrillTitle,
  expenseDrillLoading,
  expenseDrillData,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expenseDrillTitle: string
  expenseDrillLoading: boolean
  expenseDrillData: IncomeStatementExpenseDrillDown | null
  t: (k: string) => string
}) {
  const drillNavCtx =
    expenseDrillData && !expenseDrillData.error
      ? expenseDrillNavContextFromDrill(expenseDrillData)
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("pL_expenseDrillTitle")} — {expenseDrillTitle}
          </DialogTitle>
          {expenseDrillData && (
            <p className="text-xs text-muted-foreground font-normal">
              {expenseDrillData.startStr} ~ {expenseDrillData.endStr}
              {expenseDrillData.storeFilter && expenseDrillData.storeFilter !== "All"
                ? ` · ${expenseDrillData.storeFilter}`
                : ""}
            </p>
          )}
        </DialogHeader>
        {expenseDrillLoading && (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            {t("pL_expenseDrillLoading")}
          </div>
        )}
        {!expenseDrillLoading && expenseDrillData?.error && (
          <p className="text-sm text-destructive py-2">{expenseDrillData.error}</p>
        )}
        {!expenseDrillLoading && expenseDrillData && !expenseDrillData.error && (
          <div className="space-y-4 text-sm">
            {(expenseDrillData.truncated.petty ||
              expenseDrillData.truncated.bank ||
              expenseDrillData.truncated.fixed) && (
              <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-md px-2 py-1.5">
                {t("pL_expenseDrillTruncated")}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              <Link
                href={
                  drillNavCtx
                    ? buildExpenseDrillAdminHref("/admin/bank-transactions", drillNavCtx, "bank")
                    : "/admin/bank-transactions"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_expenseDrillLinkBank")}
              </Link>
              <Link
                href={
                  drillNavCtx
                    ? buildExpenseDrillAdminHref("/admin/petty-cash", drillNavCtx, "petty")
                    : "/admin/petty-cash"
                }
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t("pL_expenseDrillLinkPetty")}
              </Link>
            </div>

            {expenseDrillData.petty.length > 0 && (
              <div>
                <p className="font-medium mb-1">{t("pL_expenseDrillPetty")}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseDrillData.petty.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                          <td className="p-2 max-w-[120px] truncate">{r.store || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 max-w-[220px] truncate" title={r.memo || ""}>
                            {r.memo || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {expenseDrillData.bankWithdrawals.length > 0 && (
              <div>
                <p className="font-medium mb-1">{t("pL_expenseDrillBank")}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_purchaseDrillColId")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColDate")}</th>
                        <th className="text-left p-2">{t("pL_expenseDrillColCategory")}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseDrillData.bankWithdrawals.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2 font-mono">{r.id}</td>
                          <td className="p-2 whitespace-nowrap">{r.expenseDate || r.transDate}</td>
                          <td className="p-2">{r.category || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.amount)}</td>
                          <td className="p-2 max-w-[220px] truncate" title={r.memo || ""}>
                            {r.memo || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {expenseDrillData.fixedExpenses.length > 0 && (
              <div>
                <p className="font-medium mb-1">{t("pL_expenseDrillFixed")}</p>
                <p className="text-xs text-muted-foreground mb-2">{t("pL_expenseDrillFixedNote")}</p>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2">{t("pL_expenseDrillColName")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColStore")}</th>
                        <th className="text-right p-2">{t("amount")}</th>
                        <th className="text-left p-2">{t("pL_purchaseDrillColMemo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseDrillData.fixedExpenses.map((r) => (
                        <tr key={r.id} className="border-b border-border/60">
                          <td className="p-2">{r.name}</td>
                          <td className="p-2">{r.store}</td>
                          <td className="p-2 text-right font-mono">{formatBath(r.monthlyAmount)}</td>
                          <td className="p-2 max-w-[200px] truncate">{r.memo || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!(
              expenseDrillData.petty.length > 0 ||
              expenseDrillData.bankWithdrawals.length > 0 ||
              expenseDrillData.fixedExpenses.length > 0
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
  expandSales,
  onToggleSales,
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
  expandSales: boolean
  onToggleSales: () => void
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

  const [purchaseDrillOpen, setPurchaseDrillOpen] = React.useState(false)
  const [purchaseDrillLoading, setPurchaseDrillLoading] = React.useState(false)
  const [purchaseDrillData, setPurchaseDrillData] = React.useState<IncomeStatementPurchaseDrillDown | null>(null)
  const [purchaseDrillTitle, setPurchaseDrillTitle] = React.useState("")
  const [expenseDrillOpen, setExpenseDrillOpen] = React.useState(false)
  const [expenseDrillLoading, setExpenseDrillLoading] = React.useState(false)
  const [expenseDrillData, setExpenseDrillData] = React.useState<IncomeStatementExpenseDrillDown | null>(null)
  const [expenseDrillTitle, setExpenseDrillTitle] = React.useState("")

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

  const openExpenseDrill = React.useCallback(
    (row: NonNullable<IncomeStatementData["expenseByAccountSubject"]>[number]) => {
      if (!purchaseDrillContext?.yearMonth) return
      setExpenseDrillTitle(expenseAccountRowLabel(row, t, lang))
      setExpenseDrillOpen(true)
      setExpenseDrillLoading(true)
      setExpenseDrillData(null)
      void getIncomeStatementExpenseDrillDown({
        yearMonth: purchaseDrillContext.yearMonth,
        storeFilter: purchaseDrillContext.storeFilter,
        userStore: purchaseDrillContext.userStore,
        userRole: purchaseDrillContext.userRole,
        accountSubjectId: row.accountSubjectId ?? null,
      })
        .then((d) => setExpenseDrillData(d))
        .finally(() => setExpenseDrillLoading(false))
    },
    [purchaseDrillContext, t, lang]
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
      {data.diagnostics?.purchaseHqOutboundBasis && (
        <div
          className={`mb-2 rounded border px-3 py-2 text-xs ${
            isMaterialHqOutboundOrderDiff(data.diagnostics.purchaseHqOutboundBasis)
              ? "border-amber-400 bg-amber-50 text-amber-950"
              : "border-sky-300 bg-sky-50 text-sky-950"
          }`}
        >
          <p className="mb-1.5 leading-relaxed font-medium">{t("pL_diagHqOutboundBasis")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 font-mono text-[11px]">
            <div>
              <span className="text-muted-foreground">{t("pL_purchaseDrillHqOutbound")}: </span>
              {formatBath(data.diagnostics.purchaseHqOutboundBasis.outboundTotal)}
            </div>
            <div>
              <span className="text-muted-foreground">{t("pL_purchaseDrillHqOrdersRef")}: </span>
              {formatBath(data.diagnostics.purchaseHqOutboundBasis.approvedOrdersTotal)}
            </div>
            <div>
              <span className="text-muted-foreground">Δ: </span>
              <span
                className={
                  isMaterialHqOutboundOrderDiff(data.diagnostics.purchaseHqOutboundBasis) ? "font-semibold" : ""
                }
              >
                {formatBath(data.diagnostics.purchaseHqOutboundBasis.diff)}
              </span>
            </div>
          </div>
        </div>
      )}
      {(data.diagnostics?.purchaseExcludedHqBankPayments?.length || 0) > 0 && (
        <div className="mb-2 rounded border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-950">
          <p className="mb-1 font-medium">{t("pL_diagExcludedHqBankTitle")}</p>
          <p className="mb-1.5 leading-relaxed text-[11px] opacity-90">{t("pL_diagExcludedHqBankHint")}</p>
          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
            {data.diagnostics!.purchaseExcludedHqBankPayments!.map((row) => (
              <li key={row.key}>
                {row.key}
                {row.label ? <span className="font-sans not-italic"> — {row.label}</span> : null}:{" "}
                {formatBath(row.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <table className="w-full max-w-md text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 text-left font-medium"></th>
            <th className="py-2 text-right font-medium pr-2">{t("pL_colAmount") || "Amount"}</th>
            <th className="py-2 text-right font-medium w-14">{t("pL_pctOfSales")}</th>
          </tr>
        </thead>
        <tbody>
          {(data.salesByCustomer?.length ?? 0) > 0 ? (
            <>
              <tr
                className="border-b cursor-pointer hover:bg-muted/40 select-none"
                onClick={onToggleSales}
                title={t("pL_clickToExpand") || ""}
              >
                <td className="py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    {expandSales ? (
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                    )}
                    {t("pL_sales")}
                  </span>
                </td>
                <td className="py-2 text-right font-mono pr-2">{formatBath(view.sales)}</td>
                <td className="py-2 text-right text-muted-foreground">100.0%</td>
              </tr>
              {expandSales &&
                data.salesByCustomer!.map((row) => (
                  <tr key={row.key} className="border-b bg-muted/20">
                    <td className="py-1.5 text-muted-foreground pl-10 text-xs">
                      {salesCustomerRowLabel(row, t)}
                    </td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground pr-2 text-xs">
                      {formatBath(row.amount)}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground text-xs">{view.pct(row.amount)}</td>
                  </tr>
                ))}
              {expandSales && view.useManualSales && (
                <tr className="border-b bg-muted/10">
                  <td colSpan={3} className="py-1.5 pl-6 pr-2 text-[11px] text-muted-foreground leading-relaxed">
                    {t("pL_salesBreakdownSystemNote") ||
                      "아래 금액은 시스템 출고(배송완료) 기준 매출처별 합계입니다. 상단 매출은 수동 입력을 반영할 수 있습니다."}
                  </td>
                </tr>
              )}
            </>
          ) : (
            <tr className="border-b">
              <td className="py-2 font-medium">{t("pL_sales")}</td>
              <td className="py-2 text-right font-mono pr-2">{formatBath(view.sales)}</td>
              <td className="py-2 text-right text-muted-foreground">100.0%</td>
            </tr>
          )}
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
                {t("inNoData") || "No data found."}
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
              <tr
                key={`${row.accountSubjectId ?? "u"}-${idx}`}
                className={
                  purchaseDrillContext?.yearMonth
                    ? "border-b bg-muted/20 cursor-pointer hover:bg-muted/40"
                    : "border-b bg-muted/20"
                }
                onClick={purchaseDrillContext?.yearMonth ? () => openExpenseDrill(row) : undefined}
                title={purchaseDrillContext?.yearMonth ? t("pL_expenseDrillClickHint") : undefined}
              >
                <td className="py-1.5 text-muted-foreground pl-10 text-xs">
                  {row.accountSubjectId == null
                    ? t("pL_accountUnclassified") || "Unclassified account"
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
                {t("inNoData") || "No data found."}
              </td>
            </tr>
          )}
          {showExpenseDetails && (
            <>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground pl-4">- {t("pL_expenseSourcePetty") || "Petty Cash"}</td>
                <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                  {formatBath(data.expenseBreakdown?.pettyCash ?? 0)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {view.pct(data.expenseBreakdown?.pettyCash ?? 0)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground pl-4">- {t("pL_expenseSourceBank") || "Bank Withdrawal"}</td>
                <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                  {formatBath(data.expenseBreakdown?.bankWithdraw ?? 0)}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {view.pct(data.expenseBreakdown?.bankWithdraw ?? 0)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 text-muted-foreground pl-4">- {t("pL_expenseSourceFixed") || "Fixed Cost"}</td>
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
      <IncomeExpenseDrillDialog
        open={expenseDrillOpen}
        onOpenChange={(o) => {
          setExpenseDrillOpen(o)
          if (!o) {
            setExpenseDrillData(null)
            setExpenseDrillLoading(false)
          }
        }}
        expenseDrillTitle={expenseDrillTitle}
        expenseDrillLoading={expenseDrillLoading}
        expenseDrillData={expenseDrillData}
        t={t}
      />
    </div>
  )
}

function mapIncomeStatementOverrideSaveError(err: string | undefined, t: (k: string) => string): string {
  const c = String(err || "").trim()
  if (!c) return t("pL_overrideSharedErr")
  if (c.includes("STORE_SCOPE_FORBIDDEN")) return t("pL_overrideErrStoreScope")
  if (c === "FORBIDDEN" || c.includes("ACCOUNTING_FORBIDDEN")) return t("pL_overrideErrForbidden")
  return c
}

function formatOverrideSavedClockBangkok(ms: number, lang: string): string {
  const loc = lang === "ko" ? "ko-KR" : "en-GB"
  return new Date(ms).toLocaleTimeString(loc, {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function incomeMetricsForCompare(d: IncomeStatementData | undefined) {
  if (!isIncomeStatementData(d) || d.error) return null
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
  const [expandSales, setExpandSales] = React.useState(false)
  const [expandPurchases, setExpandPurchases] = React.useState(false)
  const [expandExpenseAccounts, setExpandExpenseAccounts] = React.useState(false)
  const [compareUnifiedExpandSales, setCompareUnifiedExpandSales] = React.useState(false)
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
  const [overridePersistAt, setOverridePersistAt] = React.useState<number | null>(null)
  const [overrideSaveBusy, setOverrideSaveBusy] = React.useState(false)
  const [overrideButtonHint, setOverrideButtonHint] = React.useState<string | null>(null)
  const overridePersistBumpTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleOverridePersistBump = React.useCallback(() => {
    if (overridePersistBumpTimer.current) clearTimeout(overridePersistBumpTimer.current)
    overridePersistBumpTimer.current = setTimeout(() => {
      overridePersistBumpTimer.current = null
      setOverridePersistAt(Date.now())
    }, 450)
  }, [])

  React.useEffect(
    () => () => {
      if (overridePersistBumpTimer.current) clearTimeout(overridePersistBumpTimer.current)
    },
    []
  )

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
    setExpandSales(false)
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
      scheduleOverridePersistBump()
      return
    }
    const p = parseSalesOverrideInput(manualAmountStr)
    if (p == null) return
    writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, true, p)
    scheduleOverridePersistBump()
  }, [overrideSource, yearMonthEnd, storeFilter, manualEnabled, manualAmountStr, scheduleOverridePersistBump])

  React.useEffect(() => {
    if (overrideSource !== "local") return
    if (!begInvManualEnabled) {
      writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, false, 0)
      scheduleOverridePersistBump()
      return
    }
    const p = parseSalesOverrideInput(begInvAmountStr)
    if (p == null) return
    writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, true, p)
    scheduleOverridePersistBump()
  }, [overrideSource, yearMonthEnd, storeFilter, begInvManualEnabled, begInvAmountStr, scheduleOverridePersistBump])

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
        else {
          setSharedSaveError(null)
          scheduleOverridePersistBump()
        }
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
    scheduleOverridePersistBump,
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
  const [compareFetchError, setCompareFetchError] = React.useState<string | null>(null)
  const [compareGranularity, setCompareGranularity] = React.useState<"month" | "year">("month")
  const [incomeCompareFetchId, setIncomeCompareFetchId] = React.useState(0)

  React.useEffect(() => {
    setCompareUnifiedExpandSales(false)
    setCompareUnifiedExpandPurchases(false)
    setCompareUnifiedExpandExpenses(false)
  }, [incomeCompareFetchId])

  const runIncomeFetch = React.useCallback(() => {
    const sf = storeFilter !== "All" ? storeFilter : undefined
    const months = periodMonths
    setCompareFetchError(null)

    const emptyIncomeOnFetchError = (ym: string, message: string): IncomeStatementData => ({
      yearMonth: ym,
      startStr: "",
      endStr: "",
      storeFilter: sf ?? "All",
      sales: 0,
      purchases: 0,
      expenses: 0,
      grossProfit: 0,
      netProfit: 0,
      error: message,
    })

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
        .catch((e) =>
          setData(
            emptyIncomeOnFetchError(
              ym,
              e instanceof Error ? e.message : String(e || "FETCH_FAILED")
            )
          )
        )
        .finally(() => setLoading(false))
      return
    }

    setLoading(true)
    setData(null)
    Promise.all(
      months.map(async (ym) => {
        try {
          const row = await getIncomeStatement({
            yearMonth: ym,
            storeFilter: sf,
            userStore: auth?.store,
            userRole: auth?.role,
            includeDebug: showExpenseDetails,
          })
          return { ym, data: row }
        } catch (e) {
          return {
            ym,
            data: emptyIncomeOnFetchError(
              ym,
              e instanceof Error ? e.message : String(e || "FETCH_FAILED")
            ),
          }
        }
      })
    )
      .then((rows) => {
        const ok = rows.filter((r) => isIncomeStatementData(r.data))
        setCompareIncomeRows(ok)
        const err = rows
          .map((r) => (r.data as IncomeStatementData | undefined)?.error)
          .find((m) => typeof m === "string" && m.trim())
        setCompareFetchError(err?.trim() || (ok.length === 0 ? t("inNoData") || "No data found." : null))
      })
      .catch(() => {
        setCompareIncomeRows([])
        setCompareFetchError(t("inNoData") || "No data found.")
      })
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
    t,
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

  const compareYearHqOutboundDiagnostics = React.useMemo(
    () => incomeYearCompare.filter((y) => y.purchaseHqOutboundBasis != null),
    [incomeYearCompare]
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

  const compareMergedSalesCustomers = React.useMemo(
    () => mergeSalesCustomerKeysForCompare(compareIncomeRows),
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

  /** 기간 내 월별 — 본사 출고 vs 승인 발주 진단 */
  const compareMonthHqOutboundDiagnostics = React.useMemo(() => {
    return compareIncomeRows
      .filter(({ data }) => !data.error && data.diagnostics?.purchaseHqOutboundBasis != null)
      .map(({ ym, data }) => ({
        ym,
        basis: data.diagnostics!.purchaseHqOutboundBasis!,
      }))
  }, [compareIncomeRows])

  /** 기간 전체 — 본사 유형 통장 매입지급 제외액을 거래처별 합산 */
  const compareMergedExcludedHqBank = React.useMemo(() => {
    const byKey = new Map<string, { amount: number; label?: string }>()
    for (const { data } of compareIncomeRows) {
      if (data.error) continue
      for (const row of data.diagnostics?.purchaseExcludedHqBankPayments || []) {
        const prev = byKey.get(row.key)
        byKey.set(row.key, {
          amount: (prev?.amount ?? 0) + row.amount,
          label: row.label || prev?.label,
        })
      }
    }
    return [...byKey.entries()]
      .map(([key, v]) => ({ key, amount: v.amount, label: v.label }))
      .sort((a, b) => b.amount - a.amount)
  }, [compareIncomeRows])

  const compareMonthHqOutboundAnyMaterial = React.useMemo(
    () =>
      compareMonthHqOutboundDiagnostics.some(({ basis }) => isMaterialHqOutboundOrderDiff(basis)),
    [compareMonthHqOutboundDiagnostics]
  )

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

  const view = React.useMemo(() => {
    if (!isIncomeStatementData(data) || data.error) return null
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
      ? t("all") || "All"
      : ["본사", "Office", "오피스", "본점"].includes(storeFilter) || storeFilter.toLowerCase().includes("office")
        ? t("pettyScopeOffice") || "Office"
        : storeFilter

  const buildXlsxRows = React.useCallback((): IncomeStatementXlsxRow[] => {
    if (!data || !view) return []
    const q = roundFinancialAmount
    const rows: IncomeStatementXlsxRow[] = []
    rows.push({ label: t("pL_sales"), amount: q(view.sales), pct: "100.0%" })
    if ((data.salesByCustomer?.length || 0) > 0) {
      for (const row of data.salesByCustomer!) {
        rows.push({
          label: `      ${salesCustomerRowLabel(row, t)}`,
          amount: q(row.amount),
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `  + ${t("pL_beginningInv")}`,
      amount: q(view.beginningInventory),
      pct: view.pct(view.beginningInventory),
    })
    rows.push({
      label: `  + ${t("pL_purchases")}`,
      amount: q(data.purchases),
      pct: view.pct(data.purchases),
    })
    if ((data.purchaseByVendor?.length || 0) > 0) {
      for (const row of data.purchaseByVendor!) {
        rows.push({
          label: `      ${purchaseVendorRowLabel(row, t)}`,
          amount: q(row.amount),
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `  - ${t("pL_endingInv")}`,
      amount: q(data.endingInventory ?? 0),
      pct: view.pct(-(data.endingInventory ?? 0)),
    })
    rows.push({
      label: `= ${t("pL_cogs")}`,
      amount: q(view.cogs),
      pct: view.pct(view.cogs),
    })
    rows.push({
      label: t("pL_grossProfit"),
      amount: q(view.grossProfit),
      pct: view.pct(view.grossProfit),
    })
    rows.push({
      label: `- ${t("pL_expenses")}`,
      amount: q(data.expenses),
      pct: view.pct(data.expenses),
    })
    if ((data.expenseByAccountSubject?.length || 0) > 0) {
      for (const row of data.expenseByAccountSubject!) {
        const label =
          row.accountSubjectId == null
            ? t("pL_accountUnclassified") || "Unclassified account"
            : formatAccountSubjectLabel(lang, {
                code: row.code,
                name: row.name,
                nameEn: row.nameEn,
                nameTh: row.nameTh,
              }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")
        rows.push({
          label: `      ${label}`,
          amount: q(row.amount),
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `    - ${t("pL_expenseSourcePetty") || "Petty Cash"}`,
      amount: q(data.expenseBreakdown?.pettyCash ?? 0),
      pct: view.pct(data.expenseBreakdown?.pettyCash ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceBank") || "Bank Withdrawal"}`,
      amount: q(data.expenseBreakdown?.bankWithdraw ?? 0),
      pct: view.pct(data.expenseBreakdown?.bankWithdraw ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFixed") || "Fixed Cost"}`,
      amount: q(data.expenseBreakdown?.fixedExpenses ?? 0),
      pct: view.pct(data.expenseBreakdown?.fixedExpenses ?? 0),
    })
    rows.push({
      label: t("pL_netProfit"),
      amount: q(view.netProfit),
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
    downloadIncomeStatementXlsx(fname, headerLines, [t("pL_colItem"), t("pL_colAmount") || "Amount", t("pL_pctOfSales")], buildXlsxRows())
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

  const handlePlOverridesSaveNow = React.useCallback(async () => {
    setOverrideButtonHint(null)
    if (manualEnabled) {
      if (!manualAmountStr.trim()) {
        setOverrideButtonHint(t("pL_overrideAmountRequiredWhenChecked"))
        return
      }
      if (parseSalesOverrideInput(manualAmountStr) == null) {
        setOverrideButtonHint(t("pL_overrideInvalidAmount"))
        return
      }
    }
    if (begInvManualEnabled) {
      if (!begInvAmountStr.trim()) {
        setOverrideButtonHint(t("pL_overrideAmountRequiredWhenChecked"))
        return
      }
      if (parseSalesOverrideInput(begInvAmountStr) == null) {
        setOverrideButtonHint(t("pL_overrideInvalidAmount"))
        return
      }
    }

    if (overrideSource === "local") {
      if (!manualEnabled) {
        writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, false, 0)
      } else {
        const p = parseSalesOverrideInput(manualAmountStr)!
        writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, true, p)
      }
      if (!begInvManualEnabled) {
        writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, false, 0)
      } else {
        const p = parseSalesOverrideInput(begInvAmountStr)!
        writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, true, p)
      }
      setOverridePersistAt(Date.now())
      return
    }

    if (sharedLoading || !sharedReady) return
    const salesAmt = parseSalesOverrideInput(manualAmountStr) ?? 0
    const begAmt = parseSalesOverrideInput(begInvAmountStr) ?? 0
    const salesOn = manualEnabled && parseSalesOverrideInput(manualAmountStr) != null
    const begOn = begInvManualEnabled && parseSalesOverrideInput(begInvAmountStr) != null

    setOverrideSaveBusy(true)
    try {
      const r = await saveIncomeStatementOverrides({
        yearMonth: yearMonthEnd,
        storeFilter,
        userStore: auth?.store,
        userRole: auth?.role,
        updatedBy: auth?.user,
        salesOverrideEnabled: salesOn,
        salesOverrideAmount: salesOn ? salesAmt : 0,
        beginningInvOverrideEnabled: begOn,
        beginningInvOverrideAmount: begOn ? begAmt : 0,
      })
      if (!r.success) {
        setSharedSaveError(r.error || "SAVE_FAILED")
        setOverrideButtonHint(mapIncomeStatementOverrideSaveError(r.error, t))
      } else {
        setSharedSaveError(null)
        setOverridePersistAt(Date.now())
      }
    } finally {
      setOverrideSaveBusy(false)
    }
  }, [
    overrideSource,
    yearMonthEnd,
    storeFilter,
    manualEnabled,
    manualAmountStr,
    begInvManualEnabled,
    begInvAmountStr,
    sharedLoading,
    sharedReady,
    auth?.store,
    auth?.role,
    auth?.user,
    t,
  ])

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
                      {isOffice && <SelectItem value="All">{t("all") || "All"}</SelectItem>}
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
              {t("loadingItems") || "Loading..."}
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
                    <p
                      className={
                        compareFetchError
                          ? "text-sm text-destructive text-center py-4"
                          : "text-sm text-muted-foreground text-center py-4"
                      }
                    >
                      {compareFetchError || t("inNoData") || "No data found."}
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
                      {compareGranularity === "month" && compareMonthHqOutboundDiagnostics.length > 0 && (
                        <div
                          className={`rounded border px-3 py-2 text-xs overflow-x-auto ${
                            compareMonthHqOutboundAnyMaterial
                              ? "border-amber-400 bg-amber-50 text-amber-950"
                              : "border-sky-300 bg-sky-50 text-sky-950"
                          }`}
                        >
                          <p className="mb-2 font-medium leading-relaxed">{t("pL_diagHqOutboundBasis")}</p>
                          <table className="w-full text-[11px] border-collapse min-w-[280px]">
                            <thead>
                              <tr className="border-b border-sky-200/80">
                                <th className="text-left p-1.5 font-medium text-muted-foreground w-[100px]">
                                  {t("pL_colItem")}
                                </th>
                                {compareMonthHqOutboundDiagnostics.map(({ ym }) => (
                                  <th key={ym} className="text-right p-1.5 font-mono whitespace-nowrap">
                                    {ym}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOutbound")}</td>
                                {compareMonthHqOutboundDiagnostics.map(({ ym, basis }) => (
                                  <td key={`o-${ym}`} className="text-right p-1.5 font-mono">
                                    {formatBath(basis.outboundTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOrdersRef")}</td>
                                {compareMonthHqOutboundDiagnostics.map(({ ym, basis }) => (
                                  <td key={`a-${ym}`} className="text-right p-1.5 font-mono">
                                    {formatBath(basis.approvedOrdersTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-t border-sky-200/60">
                                <td className="p-1.5 font-medium">Δ</td>
                                {compareMonthHqOutboundDiagnostics.map(({ ym, basis }) => (
                                  <td
                                    key={`d-${ym}`}
                                    className={`text-right p-1.5 font-mono font-medium ${
                                      isMaterialHqOutboundOrderDiff(basis) ? "bg-amber-200/80" : ""
                                    }`}
                                  >
                                    {formatBath(basis.diff)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      {compareGranularity === "year" && compareYearHqOutboundDiagnostics.length > 0 && (
                        <div
                          className={`rounded border px-3 py-2 text-xs overflow-x-auto ${
                            compareYearHqOutboundDiagnostics.some(({ purchaseHqOutboundBasis: b }) =>
                              b ? isMaterialHqOutboundOrderDiff(b) : false
                            )
                              ? "border-amber-400 bg-amber-50 text-amber-950"
                              : "border-sky-300 bg-sky-50 text-sky-950"
                          }`}
                        >
                          <p className="mb-2 font-medium leading-relaxed">{t("pL_diagHqOutboundYearAgg")}</p>
                          <table className="w-full text-[11px] border-collapse min-w-[200px]">
                            <thead>
                              <tr className="border-b border-sky-200/80">
                                <th className="text-left p-1.5 font-medium text-muted-foreground w-[100px]">
                                  {t("pL_colItem")}
                                </th>
                                {compareYearHqOutboundDiagnostics.map(({ year }) => (
                                  <th key={year} className="text-right p-1.5 font-mono whitespace-nowrap">
                                    {year}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOutbound")}</td>
                                {compareYearHqOutboundDiagnostics.map(({ year, purchaseHqOutboundBasis }) => (
                                  <td key={`yo-${year}`} className="text-right p-1.5 font-mono">
                                    {formatBath(purchaseHqOutboundBasis!.outboundTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOrdersRef")}</td>
                                {compareYearHqOutboundDiagnostics.map(({ year, purchaseHqOutboundBasis }) => (
                                  <td key={`ya-${year}`} className="text-right p-1.5 font-mono">
                                    {formatBath(purchaseHqOutboundBasis!.approvedOrdersTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-t border-sky-200/60">
                                <td className="p-1.5 font-medium">Δ</td>
                                {compareYearHqOutboundDiagnostics.map(({ year, purchaseHqOutboundBasis }) => {
                                  const b = purchaseHqOutboundBasis!
                                  return (
                                    <td
                                      key={`yd-${year}`}
                                      className={`text-right p-1.5 font-mono font-medium ${
                                        isMaterialHqOutboundOrderDiff(b) ? "bg-amber-200/80" : ""
                                      }`}
                                    >
                                      {formatBath(b.diff)}
                                    </td>
                                  )
                                })}
                              </tr>
                            </tbody>
                          </table>
                          <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                            {t("pL_diagHqCompareYearAggNote")}
                          </p>
                        </div>
                      )}
                      {compareGranularity === "year" &&
                        compareMonthHqOutboundDiagnostics.length > 0 &&
                        compareYearHqOutboundDiagnostics.length === 0 && (
                        <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded px-3 py-2">
                          {t("pL_diagHqCompareYearOnlyHint")}
                        </p>
                      )}
                      {compareMergedExcludedHqBank.length > 0 && (
                        <div className="rounded border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-950">
                          <p className="mb-1 font-medium">{t("pL_diagExcludedHqBankTitle")}</p>
                          <p className="mb-1.5 leading-relaxed text-[11px] opacity-90">{t("pL_diagExcludedHqBankHint")}</p>
                          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                            {compareMergedExcludedHqBank.map((row) => (
                              <li key={row.key}>
                                {row.key}
                                {row.label ? <span className="font-sans not-italic"> — {row.label}</span> : null}:{" "}
                                {formatBath(row.amount)}
                              </li>
                            ))}
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
                                {incomeComparePlRows.map((row) => {
                                  const salesExpandable =
                                    row.key === "sales" && compareMergedSalesCustomers.length > 0
                                  return (
                                  <React.Fragment key={row.key}>
                                    <tr
                                      className={`border-b last:border-0 ${
                                        row.key === "purchases" ||
                                        row.key === "expenses" ||
                                        salesExpandable
                                          ? "cursor-pointer hover:bg-muted/40 select-none"
                                          : ""
                                      }`}
                                      onClick={
                                        row.key === "purchases"
                                          ? () => setCompareUnifiedExpandPurchases((v) => !v)
                                          : row.key === "expenses"
                                            ? () => setCompareUnifiedExpandExpenses((v) => !v)
                                            : salesExpandable
                                              ? () => setCompareUnifiedExpandSales((v) => !v)
                                              : undefined
                                      }
                                    >
                                      <td className="p-2 font-medium sticky left-0 bg-background z-10">
                                        {row.key === "purchases" || row.key === "expenses" || salesExpandable ? (
                                          <span className="inline-flex items-center gap-1">
                                            {row.key === "purchases" ? (
                                              compareUnifiedExpandPurchases ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                              )
                                            ) : row.key === "expenses" ? (
                                              compareUnifiedExpandExpenses ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                              )
                                            ) : compareUnifiedExpandSales ? (
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
                                    {row.key === "sales" &&
                                      compareUnifiedExpandSales &&
                                      compareMergedSalesCustomers.map((sc) => (
                                        <tr
                                          key={`y-sc-${sc.key}`}
                                          className="border-b bg-muted/10 last:border-0"
                                        >
                                          <td className="p-1.5 pl-10 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                            {salesCustomerRowLabel(
                                              { key: sc.key, label: sc.label },
                                              t
                                            )}
                                          </td>
                                          {incomeCompareCols.map((c) => (
                                            <td
                                              key={c.key}
                                              className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                              title={t("fs_compareYearAggregateHint")}
                                            >
                                              {formatBath(
                                                yearlySalesCustomerAmount(
                                                  compareIncomeRows,
                                                  c.key,
                                                  sc.key
                                                )
                                              )}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
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
                                              ? t("pL_accountUnclassified") || "Unclassified account"
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
                                  )
                                })}
                              </>
                            ) : (
                              <>
                                {compareMergedSalesCustomers.length > 0 ? (
                                  <tr
                                    className="border-b cursor-pointer hover:bg-muted/40 select-none"
                                    onClick={() => setCompareUnifiedExpandSales((v) => !v)}
                                  >
                                    <td className="p-2 font-medium sticky left-0 bg-background z-10">
                                      <span className="inline-flex items-center gap-1">
                                        {compareUnifiedExpandSales ? (
                                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                        )}
                                        {t("pL_sales")}
                                      </span>
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
                                ) : (
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
                                )}
                                {compareUnifiedExpandSales &&
                                  compareMergedSalesCustomers.map((sc) => (
                                    <tr key={`m-sc-${sc.key}`} className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-10 text-xs text-muted-foreground sticky left-0 bg-muted/10 z-10">
                                        {salesCustomerRowLabel({ key: sc.key, label: sc.label }, t)}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => {
                                        const amt = salesAmountForCustomer(rowData, sc.key)
                                        return (
                                          <td
                                            key={ym}
                                            className="p-1.5 text-right font-mono text-xs text-muted-foreground whitespace-nowrap"
                                          >
                                            {rowData.error ? "—" : formatBath(amt)}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
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
                                          ? t("pL_accountUnclassified") || "Unclassified account"
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
                    {t("inNoData") || "No data found."}
                  </p>
                )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId === 0 &&
                !props.hideControls && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("msg_click_query") || "Click Query button."}
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
                      <span className="text-xs text-destructive">
                        {mapIncomeStatementOverrideSaveError(sharedSaveError, t)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-3xl">{t("pL_overrideStorageNote")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9"
                      disabled={
                        overrideSaveBusy ||
                        (overrideSource === "shared" && (sharedLoading || !sharedReady))
                      }
                      onClick={() => void handlePlOverridesSaveNow()}
                    >
                      {overrideSaveBusy ? t("pL_overrideSavingShort") : t("pL_overrideSaveNow")}
                    </Button>
                    {overridePersistAt != null && (
                      <span className="text-xs text-muted-foreground">
                        {t("pL_overrideLastSavedBangkok").replace(
                          "{time}",
                          formatOverrideSavedClockBangkok(overridePersistAt, lang)
                        )}
                      </span>
                    )}
                    {overrideButtonHint ? (
                      <span className="text-xs text-destructive">{overrideButtonHint}</span>
                    ) : null}
                  </div>
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
                        onFocus={() => setOverrideButtonHint(null)}
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
                        onFocus={() => setOverrideButtonHint(null)}
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

              {!isRangeCompare && data?.error ? (
                <p className="text-sm text-destructive py-4 px-1">{data.error}</p>
              ) : null}
              {!isRangeCompare && (data?.diagnostics?.warnings?.length ?? 0) > 0 ? (
                <div className="mb-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {data!.diagnostics!.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              ) : null}
              {!isRangeCompare && isIncomeStatementData(data) && !data.error && view ? (
                <div className="overflow-x-auto">
                  <IncomePlDetailTableContent
                    data={data}
                    view={view}
                    periodLine={`${data.yearMonth} · ${storeLabel}`}
                    showExpenseDetails={showExpenseDetails}
                    expandSales={expandSales}
                    onToggleSales={() => setExpandSales((v) => !v)}
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
              ) : !isRangeCompare && !data ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("msg_click_query") || "Click Query button."}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
