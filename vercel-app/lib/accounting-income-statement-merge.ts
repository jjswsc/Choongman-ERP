import type {
  BalanceSheetReport,
  IncomeStatementLineDetail,
  IncomeStatementReport,
  UnpostedBankTransaction,
} from '@/lib/accounting-reports'
import { plExpenseSubjectRowKey } from '@/lib/accounting-po-franchise-billing-pl-shared'
import { emptyNetVatBuckets, mergeNetVatBuckets } from '@/lib/income-statement-item-vat'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mergeLineDetails(rows: IncomeStatementLineDetail[][]): IncomeStatementLineDetail[] | undefined {
  const flat = rows.flat().filter((r) => r && Number(r.amount) !== 0)
  if (flat.length === 0) return undefined
  const byKey = new Map<string, IncomeStatementLineDetail>()
  for (const row of flat) {
    const key = String(row.key || '').trim() || '__unknown__'
    const prev = byKey.get(key)
    const amt = round2((prev?.amount ?? 0) + Number(row.amount || 0))
    const vat = round2((prev?.vatAmount ?? 0) + Number(row.vatAmount || 0))
    byKey.set(key, {
      key,
      amount: amt,
      label: prev?.label || row.label,
      amountBasis: prev?.amountBasis || row.amountBasis,
      ...(vat > 0 ? { vatAmount: vat } : {}),
    })
  }
  return Array.from(byKey.values()).sort((a, b) => b.amount - a.amount)
}

function mergeExpenseBySubject(
  rows: NonNullable<IncomeStatementReport['expenseByAccountSubject']>[]
): IncomeStatementReport['expenseByAccountSubject'] {
  const flat = rows.flat().filter(Boolean)
  if (flat.length === 0) return undefined
  const byId = new Map<string, NonNullable<IncomeStatementReport['expenseByAccountSubject']>[number]>()
  for (const row of flat) {
    const idKey = plExpenseSubjectRowKey(row)
    const prev = byId.get(idKey)
    const amt = round2((prev?.amount ?? 0) + Number(row.amount || 0))
    const vat = round2((prev?.vatAmount ?? 0) + Number(row.vatAmount || 0))
    byId.set(idKey, {
      accountSubjectId: row.accountSubjectId,
      code: prev?.code || row.code,
      name: prev?.name || row.name,
      nameEn: prev?.nameEn ?? row.nameEn,
      nameTh: prev?.nameTh ?? row.nameTh,
      amount: amt,
      ...(vat > 0 ? { vatAmount: vat } : {}),
    })
  }
  return Array.from(byId.values()).sort((a, b) => b.amount - a.amount)
}

/** 가맹 허용 매장별 손익 → 「내 매장 전체」합산 */
export function mergeIncomeStatementReports(
  reports: IncomeStatementReport[],
  meta: { yearMonth: string; startStr: string; endStr: string }
): IncomeStatementReport {
  if (reports.length === 0) {
    return {
      yearMonth: meta.yearMonth,
      startStr: meta.startStr,
      endStr: meta.endStr,
      storeFilter: 'All',
      timezone: 'Asia/Bangkok',
      sales: 0,
      purchases: 0,
      beginningInventory: 0,
      endingInventory: 0,
      cogs: 0,
      expenses: 0,
      grossProfit: 0,
      netProfit: 0,
      expenseBreakdown: {
        pettyCash: 0,
        bankWithdraw: 0,
        deliveryAppFees: 0,
        cardFees: 0,
        fixedExpenses: 0,
        stockInboundExpense: 0,
        payrollExpense: 0,
        depreciationExpense: 0,
        franchiseRoyalty: 0,
        franchiseDeliveryGp: 0,
        franchiseGrabGp: 0,
        franchiseBillingCombined: 0,
        pp30VatRemittance: 0,
        total: 0,
      },
    }
  }
  if (reports.length === 1) {
    return { ...reports[0]!, storeFilter: 'All' }
  }

  const sum = (pick: (r: IncomeStatementReport) => number) =>
    round2(reports.reduce((a, r) => a + pick(r), 0))

  const warnings = new Set<string>()
  const limits: Record<string, { fetched: number; limit: number; total?: number }> = {}
  const overlapKeys = new Set<string>()
  const excludedHq: { key: string; amount: number; label?: string }[] = []

  for (const r of reports) {
    for (const w of r.diagnostics?.warnings || []) warnings.add(w)
    for (const [k, v] of Object.entries(r.diagnostics?.limits || {})) {
      const prev = limits[k]
      if (!prev) limits[k] = { ...v }
      else {
        limits[k] = {
          fetched: (prev.fetched || 0) + (v.fetched || 0),
          limit: Math.max(prev.limit || 0, v.limit || 0),
          total: (prev.total ?? 0) + (v.total ?? 0),
        }
      }
    }
    for (const k of r.diagnostics?.purchaseInboundBankOverlapVendorKeys || []) overlapKeys.add(k)
    for (const x of r.diagnostics?.purchaseExcludedHqBankPayments || []) excludedHq.push(x)
  }

  const sales = sum((r) => r.sales)
  const purchases = sum((r) => r.purchases)
  const beginningInventory = sum((r) => r.beginningInventory)
  const endingInventory = sum((r) => r.endingInventory)
  const cogs = sum((r) => r.cogs)
  const expenses = sum((r) => r.expenses)
  const grossProfit = sum((r) => r.grossProfit)
  const netProfit = sum((r) => r.netProfit)

  const expenseBreakdown = {
    pettyCash: sum((r) => r.expenseBreakdown.pettyCash),
    bankWithdraw: sum((r) => r.expenseBreakdown.bankWithdraw),
    deliveryAppFees: sum((r) => r.expenseBreakdown.deliveryAppFees),
    cardFees: sum((r) => r.expenseBreakdown.cardFees),
    fixedExpenses: sum((r) => r.expenseBreakdown.fixedExpenses),
    stockInboundExpense: sum((r) => r.expenseBreakdown.stockInboundExpense ?? 0),
    payrollExpense: sum((r) => r.expenseBreakdown.payrollExpense ?? 0),
    depreciationExpense: sum((r) => r.expenseBreakdown.depreciationExpense ?? 0),
    franchiseRoyalty: sum((r) => r.expenseBreakdown.franchiseRoyalty ?? 0),
    franchiseDeliveryGp: sum((r) => r.expenseBreakdown.franchiseDeliveryGp ?? 0),
    franchiseGrabGp: sum((r) => r.expenseBreakdown.franchiseGrabGp ?? 0),
    franchiseBillingCombined: sum((r) => r.expenseBreakdown.franchiseBillingCombined ?? 0),
    pp30VatRemittance: sum((r) => r.expenseBreakdown.pp30VatRemittance ?? 0),
    total: sum((r) => r.expenseBreakdown.total),
  }

  const purchaseByVendor = mergeLineDetails(reports.map((r) => r.purchaseByVendor || []))
  const salesByCustomer = mergeLineDetails(reports.map((r) => r.salesByCustomer || []))
  const salesByDay = mergeLineDetails(reports.map((r) => r.salesByDay || []))
  const expenseByAccountSubject = mergeExpenseBySubject(
    reports.map((r) => r.expenseByAccountSubject || [])
  )

  const salesStockVatBuckets = reports.reduce((acc, r) => {
    const b = r.displayAmounts?.salesStockVatBuckets
    return b ? mergeNetVatBuckets(acc, b) : acc
  }, emptyNetVatBuckets())
  const purchasesStockVatBuckets = reports.reduce((acc, r) => {
    const b = r.displayAmounts?.purchasesStockVatBuckets
    return b ? mergeNetVatBuckets(acc, b) : acc
  }, emptyNetVatBuckets())

  const displayAmounts = {
    salesGross: sum((r) => r.displayAmounts?.salesGross ?? r.sales),
    salesNet: sum((r) => r.displayAmounts?.salesNet ?? r.sales),
    purchasesGross: sum((r) => r.displayAmounts?.purchasesGross ?? r.purchases),
    purchasesNet: sum((r) => r.displayAmounts?.purchasesNet ?? r.purchases),
    beginningInventoryGross: sum(
      (r) => r.displayAmounts?.beginningInventoryGross ?? r.beginningInventory
    ),
    beginningInventoryNet: sum((r) => r.displayAmounts?.beginningInventoryNet ?? r.beginningInventory),
    endingInventoryGross: sum((r) => r.displayAmounts?.endingInventoryGross ?? r.endingInventory),
    endingInventoryNet: sum((r) => r.displayAmounts?.endingInventoryNet ?? r.endingInventory),
    franchiseBillingGross: sum((r) => r.displayAmounts?.franchiseBillingGross ?? 0),
    franchiseBillingNet: sum((r) => r.displayAmounts?.franchiseBillingNet ?? 0),
    franchiseRoyaltyGross: sum((r) => r.displayAmounts?.franchiseRoyaltyGross ?? 0),
    franchiseRoyaltyNet: sum((r) => r.displayAmounts?.franchiseRoyaltyNet ?? 0),
    franchiseDeliveryGpGross: sum((r) => r.displayAmounts?.franchiseDeliveryGpGross ?? 0),
    franchiseDeliveryGpNet: sum((r) => r.displayAmounts?.franchiseDeliveryGpNet ?? 0),
    franchiseGrabGpGross: sum((r) => r.displayAmounts?.franchiseGrabGpGross ?? 0),
    franchiseGrabGpNet: sum((r) => r.displayAmounts?.franchiseGrabGpNet ?? 0),
    franchiseBillingCombinedGross: sum((r) => r.displayAmounts?.franchiseBillingCombinedGross ?? 0),
    franchiseBillingCombinedNet: sum((r) => r.displayAmounts?.franchiseBillingCombinedNet ?? 0),
    franchiseRevenueGross: sum((r) => r.displayAmounts?.franchiseRevenueGross ?? 0),
    franchiseRevenueNet: sum((r) => r.displayAmounts?.franchiseRevenueNet ?? 0),
    expensesCashVat: sum((r) => r.displayAmounts?.expensesCashVat ?? 0),
    purchasesBankVat: sum((r) => r.displayAmounts?.purchasesBankVat ?? 0),
    pp30Remittance: sum((r) => r.displayAmounts?.pp30Remittance ?? 0),
    ...(salesStockVatBuckets.taxableNet > 0 || salesStockVatBuckets.exemptNet > 0
      ? { salesStockVatBuckets }
      : {}),
    ...(purchasesStockVatBuckets.taxableNet > 0 || purchasesStockVatBuckets.exemptNet > 0
      ? { purchasesStockVatBuckets }
      : {}),
  }

  const ebitdaBridge = {
    depreciation: sum((r) => r.ebitdaBridge?.depreciation ?? 0),
    interest: sum((r) => r.ebitdaBridge?.interest ?? 0),
    incomeTax: sum((r) => r.ebitdaBridge?.incomeTax ?? 0),
  }

  const outboundTotal = sum((r) => r.diagnostics?.purchaseHqOutboundBasis?.outboundTotal ?? 0)
  const approvedOrdersTotal = sum(
    (r) => r.diagnostics?.purchaseHqOutboundBasis?.approvedOrdersTotal ?? 0
  )

  return {
    yearMonth: meta.yearMonth,
    startStr: meta.startStr,
    endStr: meta.endStr,
    storeFilter: 'All',
    timezone: 'Asia/Bangkok',
    sales,
    purchases,
    beginningInventory,
    endingInventory,
    cogs,
    expenses,
    grossProfit,
    netProfit,
    expenseBreakdown,
    expenseByAccountSubject,
    purchaseByVendor,
    salesByCustomer,
    salesByDay,
    displayAmounts,
    ebitdaBridge,
    diagnostics: {
      warnings: [...warnings],
      limits,
      purchaseInboundBankOverlapVendorKeys: overlapKeys.size ? [...overlapKeys] : undefined,
      purchaseHqOutboundBasis:
        outboundTotal > 0 || approvedOrdersTotal > 0
          ? {
              outboundTotal,
              approvedOrdersTotal,
              diff: round2(outboundTotal - approvedOrdersTotal),
            }
          : undefined,
      purchaseExcludedHqBankPayments: excludedHq.length ? excludedHq : undefined,
    },
  }
}

/** 가맹 허용 매장별 대차 → 「내 매장 전체」합산 */
export function mergeBalanceSheetReports(
  reports: BalanceSheetReport[],
  meta: { yearMonth: string; startStr: string; endStr: string }
): BalanceSheetReport {
  if (reports.length === 0) {
    return {
      yearMonth: meta.yearMonth,
      startStr: meta.startStr,
      endStr: meta.endStr,
      storeFilter: 'All',
      timezone: 'Asia/Bangkok',
      assets: { cashAndBanks: 0, inventory: 0, receivables: 0, loansReceivable: 0, total: 0 },
      liabilities: { payables: 0, borrowings: 0, total: 0 },
      equity: {
        openingCapital: 0,
        retainedEarningsYtd: 0,
        currentPeriodProfit: 0,
        total: 0,
      },
      balanceCheckDiff: 0,
      unpostedBankWithdrawals: [],
    }
  }
  if (reports.length === 1) {
    return { ...reports[0]!, storeFilter: 'All' }
  }

  const sum = (pick: (r: BalanceSheetReport) => number) =>
    round2(reports.reduce((a, r) => a + pick(r), 0))

  const cashAndBanks = sum((r) => r.assets.cashAndBanks)
  const inventory = sum((r) => r.assets.inventory)
  const receivables = sum((r) => r.assets.receivables)
  const loansReceivable = sum((r) => r.assets.loansReceivable || 0)
  const assetsTotal = sum((r) => r.assets.total)
  const payables = sum((r) => r.liabilities.payables)
  const borrowings = sum((r) => r.liabilities.borrowings || 0)
  const liabilitiesTotal = sum((r) => r.liabilities.total)
  const openingCapital = sum((r) => r.equity.openingCapital)
  const retainedEarningsYtd = sum((r) => r.equity.retainedEarningsYtd)
  const currentPeriodProfit = sum((r) => r.equity.currentPeriodProfit)
  const equityTotal = sum((r) => r.equity.total)
  const balanceCheckDiff = round2(assetsTotal - (liabilitiesTotal + equityTotal))

  const glAccount1130 = sum((r) => r.ledgerBreakdown?.glAccount1130 ?? 0)
  const subledgerReceivables = sum((r) => r.ledgerBreakdown?.subledgerReceivables ?? 0)
  const glAccount2110 = sum((r) => r.ledgerBreakdown?.glAccount2110 ?? 0)
  const subledgerPayables = sum((r) => r.ledgerBreakdown?.subledgerPayables ?? 0)
  const glAccount2150 = sum((r) => r.ledgerBreakdown?.glAccount2150 ?? 0)
  const subledgerBorrowings = sum((r) => r.ledgerBreakdown?.subledgerBorrowings ?? 0)
  const glAccount1150 = sum((r) => r.ledgerBreakdown?.glAccount1150 ?? 0)
  const glAccount1010 = sum((r) => r.ledgerBreakdown?.glAccount1010 ?? 0)

  const unposted: UnpostedBankTransaction[] = []
  for (const r of reports) {
    for (const u of r.unpostedBankWithdrawals || []) unposted.push(u)
  }

  return {
    yearMonth: meta.yearMonth,
    startStr: meta.startStr,
    endStr: meta.endStr,
    storeFilter: 'All',
    timezone: 'Asia/Bangkok',
    assets: { cashAndBanks, inventory, receivables, loansReceivable, total: assetsTotal },
    liabilities: { payables, borrowings, total: liabilitiesTotal },
    ledgerBreakdown: {
      glAccount1130,
      subledgerReceivables,
      glAccount2110,
      subledgerPayables,
      glAccount2150,
      subledgerBorrowings,
      glAccount1150,
      glAccount1010,
      glSource: reports[0]?.ledgerBreakdown?.glSource ?? 'select',
    },
    equity: {
      openingCapital,
      retainedEarningsYtd,
      currentPeriodProfit,
      total: equityTotal,
    },
    balanceCheckDiff,
    unpostedBankWithdrawals: unposted,
  }
}
