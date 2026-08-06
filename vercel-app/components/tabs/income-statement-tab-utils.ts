import type { IncomeStatementData } from "@/lib/api-client"
import {
  PL_FRANCHISE_BILLING_SALES_KEY,
  plExpenseSubjectRowKey,
} from "@/lib/accounting-po-franchise-billing-pl-shared"
import {
  convertLineAmount,
  convertExpenseSubjectAmount,
  pickFranchiseBillingVatAmount,
  type IncomeStatementAmountBasisKind,
  type IncomeStatementVatDisplayMode,
} from "@/lib/income-statement-display"
import { PL_PETTY_CASH_PURCHASE_VENDOR_KEY } from "@/lib/income-statement-purchase-drill-nav"

export function lineDisplayAmount(
  row: {
    amount: number
    amountBasis?: IncomeStatementAmountBasisKind
    key?: string
    vatAmount?: number
  },
  vatMode: IncomeStatementVatDisplayMode,
  stockVatBuckets?: { taxableNet: number; exemptNet: number } | null,
  displayAmounts?: IncomeStatementData["displayAmounts"]
): number {
  if (row.key === PL_FRANCHISE_BILLING_SALES_KEY && displayAmounts) {
    return pickFranchiseBillingVatAmount(
      displayAmounts.franchiseRevenueGross ?? row.amount,
      displayAmounts.franchiseRevenueNet,
      vatMode
    )
  }
  return convertLineAmount(
    row.amount,
    row.amountBasis ?? "stock_net",
    vatMode,
    stockVatBuckets,
    row.vatAmount
  )
}

export function purchaseVendorRowLabel(row: { key: string; label?: string }, t: (k: string) => string): string {
  if (row.key === '__pl_hq_orders__') return t('pL_purchaseHqOrders') || '본사 창고 출고(매입)'
  if (row.key === PL_PETTY_CASH_PURCHASE_VENDOR_KEY) return t('pL_purchasePettyCash') || '패티캐시 매입'
  if (row.key === '__pl_vendor_unknown__') return t('pL_vendorUnknown') || '거래처 미지정'
  const n = String(row.label || '').trim()
  return n || row.key
}

export function purchaseVendorLabelForKey(
  key: string,
  purchaseByVendor: IncomeStatementData['purchaseByVendor'] | undefined
): string | undefined {
  const row = purchaseByVendor?.find((r) => r.key === key)
  const n = String(row?.label || '').trim()
  return n || undefined
}

export function purchaseAmountForVendor(data: IncomeStatementData | undefined, vendorKey: string): number {
  if (!data?.purchaseByVendor) return 0
  const r = data.purchaseByVendor.find((x) => x.key === vendorKey)
  return r ? Number(r.amount) || 0 : 0
}

function salesCustomerRowLabel(row: { key: string; label?: string }, t: (k: string) => string): string {
  if (row.key === PL_FRANCHISE_BILLING_SALES_KEY) {
    return t("pL_salesFranchiseBilling") || "Franchise billing (approved PO)"
  }
  if (row.key === "__pl_sales_customer_unknown__") return t("pL_salesCustomerUnknown") || "Unspecified customer"
  const n = String(row.label || "").trim()
  return n || row.key
}

/** 본사 매출처별 또는 매장 POS 영업일별 */
export function incomeStatementSalesBreakdown(data: IncomeStatementData | undefined): {
  key: string
  amount: number
  label?: string
}[] {
  if (!data) return []
  if ((data.salesByCustomer?.length ?? 0) > 0) return data.salesByCustomer!
  if ((data.salesByDay?.length ?? 0) > 0) {
    const lo = String(data.startStr || "").slice(0, 10)
    const hi = String(data.endStr || "").slice(0, 10)
    const daily = /^\d{4}-\d{2}-\d{2}$/
    return data.salesByDay!.filter((r) => {
      const k = String(r.key || "").slice(0, 10)
      if (!daily.test(k) || !daily.test(lo) || !daily.test(hi)) return true
      return k >= lo && k <= hi
    })
  }
  return []
}

export function salesBreakdownIsDaily(data: IncomeStatementData | undefined): boolean {
  return (data?.salesByDay?.length ?? 0) > 0 && (data?.salesByCustomer?.length ?? 0) === 0
}

/** 본사 손익 — 물류 출고 매출처별 (POS·일별 아님) */
export function salesBreakdownIsHqOutbound(data: IncomeStatementData | undefined): boolean {
  return (data?.salesByCustomer?.length ?? 0) > 0 && (data?.salesByDay?.length ?? 0) === 0
}

export function salesBreakdownRowLabel(
  row: { key: string; label?: string },
  t: (k: string) => string,
  daily: boolean
): string {
  if (daily) return row.key
  return salesCustomerRowLabel(row, t)
}

export function salesAmountForBreakdownKey(
  data: IncomeStatementData | undefined,
  breakdownKey: string
): number {
  const r = incomeStatementSalesBreakdown(data).find((x) => x.key === breakdownKey)
  return r ? Number(r.amount) || 0 : 0
}

export function mergeSalesBreakdownKeysForCompare(
  rows: { ym: string; data: IncomeStatementData }[]
): { key: string; label?: string }[] {
  const labelByKey = new Map<string, string | undefined>()
  for (const { data } of rows) {
    if (data.error) continue
    for (const r of incomeStatementSalesBreakdown(data)) {
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
    const dateCmp = dailyBreakdownKeySort(a, b)
    if (dateCmp !== 0) return dateCmp
    const ta = rows.reduce((s, x) => s + salesAmountForBreakdownKey(x.data, a), 0)
    const tb = rows.reduce((s, x) => s + salesAmountForBreakdownKey(x.data, b), 0)
    return tb - ta
  })
  return keys.map((key) => ({ key, label: labelByKey.get(key) }))
}

/** YYYY-MM-DD 키는 날짜순, 그 외는 금액 정렬 유지 */
function dailyBreakdownKeySort(a: string, b: string): number {
  const daily = /^\d{4}-\d{2}-\d{2}$/
  if (daily.test(a) && daily.test(b)) return a.localeCompare(b)
  return 0
}

export function mergePurchaseVendorKeysForCompare(
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

export function expenseAmountForSubject(
  data: IncomeStatementData | undefined,
  subject: { accountSubjectId: number | null; code?: string | null },
  vatMode: IncomeStatementVatDisplayMode = "included"
): number {
  if (!data?.expenseByAccountSubject) return 0
  const key = plExpenseSubjectRowKey(subject)
  const r = data.expenseByAccountSubject.find((x) => plExpenseSubjectRowKey(x) === key)
  if (!r) return 0
  return convertExpenseSubjectAmount(Number(r.amount) || 0, r.vatAmount, vatMode)
}

export function mergeExpenseSubjectsForCompare(rows: { data: IncomeStatementData }[]): {
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
      const k = plExpenseSubjectRowKey(r)
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
    const ta = rows.reduce((s, x) => s + expenseAmountForSubject(x.data, a), 0)
    const tb = rows.reduce((s, x) => s + expenseAmountForSubject(x.data, b), 0)
    return tb - ta
  })
  return list
}

export function yearlyPurchaseVendorAmount(
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

export function yearlySalesBreakdownAmount(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  breakdownKey: string
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += salesAmountForBreakdownKey(data, breakdownKey)
  }
  return s
}

export function yearlyExpenseSubjectAmount(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  subject: { accountSubjectId: number | null; code?: string | null },
  vatMode: IncomeStatementVatDisplayMode = "included"
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += expenseAmountForSubject(data, subject, vatMode)
  }
  return s
}

export function yearlyExpenseBreakdownField(
  rows: { ym: string; data: IncomeStatementData }[],
  year: string,
  field:
    | "pettyCash"
    | "bankWithdraw"
    | "deliveryAppFees"
    | "cardFees"
    | "fixedExpenses"
    | "stockInboundExpense"
    | "payrollExpense"
    | "depreciationExpense"
    | "franchiseRoyalty"
    | "franchiseDeliveryGp"
    | "franchiseGrabGp"
    | "franchiseBillingCombined"
): number {
  let s = 0
  for (const { ym, data } of rows) {
    if (!ym.startsWith(year)) continue
    if (data.error) continue
    s += Number(data.expenseBreakdown?.[field]) || 0
  }
  return s
}
