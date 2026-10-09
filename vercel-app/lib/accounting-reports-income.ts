import {
  excludeBankPurchasesWhenDirectInboundPresent,
  normalizeVendorAmountMap,
} from '@/lib/accounting-purchase-vendor-key'
import {
  isHqVendorPurchaseKey,
  partitionPurchaseVendorMapByHqCodes,
} from '@/lib/accounting-reports-purchase-hq-dedupe'
import { sumCompletedPosSalesTotal } from '@/lib/accounting-pos-sales'
import { sumHqOutboundSalesMatchingOutboundManagement } from '@/lib/hq-outbound-income-total'
import { resolveAccountingRollupStores } from '@/lib/accounting-store-scope'
import { mergeIncomeStatementReports } from '@/lib/accounting-income-statement-merge'
import { loadCardBillAllocationLinesForPl } from '@/lib/card-bill-income-statement'
import {
  sumEbitdaAddBacksFromExpenseSubjects,
  type IncomeStatementDisplayAmounts,
  type IncomeStatementEbitdaBridge,
} from '@/lib/income-statement-display'
import { buildStoreFieldOrIlikeFragment } from '@/lib/accounting-store-match'
import {
  supabaseCountFilter,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import {
  loadFranchiseBillingForIncomeStatement,
  PL_FRANCHISE_BILLING_SALES_KEY,
  type FranchiseBillingPlSlice,
} from '@/lib/accounting-po-franchise-billing-pl'
import {
  emptyNetVatBuckets,
  grossFromNetVatBuckets,
  mergeNetVatBuckets,
  netTotalFromBuckets,
} from '@/lib/income-statement-item-vat'
import { loadItemTaxTypeMap } from '@/lib/income-statement-item-vat-server'
import {
  isSalaryLikePlExpenseRow,
  loadPayrollAggregateForIncomeStatement,
  resolveSalaryCashPlDecision,
} from '@/lib/accounting-payroll-pl'
import { plFetchEndStrWithPayrollPayWindow } from '@/lib/payroll-utils'
import { resolveBankPlCashVat } from '@/lib/income-statement-cash-vat'
import {
  addBankExpenseWithdrawToPl,
  addPettyCashRowToPl,
  addToSubjectMap,
  appendFranchiseBillingExpenseSubjects,
  bankExpenseInPlPeriod,
  buildExpenseByAccountList,
  feeAccountSubjectIdsFromMeta,
  loadAccountSubjectMeta,
  loadDeliveryCardFeeAccrualsForPl,
  loadItemAccountSubjectMap,
  mergeExpenseSubjectMaps,
  sumExpenseSubjectAmounts,
} from '@/lib/accounting-reports-expense-routing'
import {
  getHqOutboundPurchaseVatBuckets,
  getHqOutboundSalesVatBuckets,
  getInventoryValue,
  getInventoryVatBuckets,
  loadItemValuationUnitCostMap,
  sumDepreciationForIncomeStatement,
  tagPurchaseVendorBasis,
} from '@/lib/accounting-reports-inventory'
import {
  appendPp30ExpenseSubject,
  buildHqOutboundFromOfficeFilter,
  collectInboundBankOverlapVendorKeys,
  type DirectInboundPurchaseOpts,
  enrichPurchaseByVendorLabels,
  fetchBankPurchasePaymentsByVendor,
  fetchBankWithdrawRowsForPl,
  getDirectInboundPurchasesByVendor,
  getFixedExpensesAggregate,
  loadExpenseAccrualVatByBankIds,
  loadHqVendorMatchIndex,
  loadPp30VatRemittanceForIncomeStatement,
  loadVendorCodeNormToNameMap,
  loadVendorPurchaseKeyIndex,
  mergeVatBucketsForKeys,
  mergeVendorAmountMap,
  pickVendorVatForKeptAmounts,
  sumHqOutboundPurchaseFromOffice,
  sumVendorMap,
} from '@/lib/accounting-reports-purchase-sources'
import {
  ACCOUNTING_ROWS_MAX,
  BASE_LIMIT,
  type IncomeScopeInput,
  type IncomeStatementLineDetail,
  type IncomeStatementReport,
  isHqAccountingStoreRow,
  normalizeIncomeScope,
  round2,
} from '@/lib/accounting-reports-shared'

export async function computeIncomeStatementReport(input: IncomeScopeInput): Promise<IncomeStatementReport> {
  const scope = normalizeIncomeScope(input)
  const rollupStores = resolveAccountingRollupStores(scope)
  if (rollupStores && rollupStores.length > 1) {
    const perStore = await Promise.all(
      rollupStores.map((store) =>
        computeIncomeStatementReport({
          ...input,
          storeFilter: store,
        })
      )
    )
    return mergeIncomeStatementReports(perStore, {
      yearMonth: scope.yearMonth,
      startStr: scope.startStr,
      endStr: scope.endStr,
    })
  }
  const { startStr, endStr, storeFilter, isHQ, yearMonth } = scope
  const warnings: string[] = []
  const limits: Record<string, { fetched: number; limit: number; total?: number }> = {}
  let purchaseInboundBankOverlapVendorKeys: string[] = []

  const [itemUnitCostMap, subjectMeta, itemAccountSubjectMap, itemTaxMap] = await Promise.all([
    loadItemValuationUnitCostMap(),
    loadAccountSubjectMeta(),
    loadItemAccountSubjectMap(),
    loadItemTaxTypeMap(),
  ])

  let sales = 0
  let salesNetForDisplay = 0
  let salesGrossForDisplay = 0
  let purchases = 0
  let purchasesStockNet = 0
  let directInboundVatBuckets = emptyNetVatBuckets()
  let purchasesBankGross = 0
  let purchasesBankVat = 0
  let cashExpenseVat = 0
  const bankPurchaseVendorKeys = new Set<string>()
  let pettyCashExpense = 0
  let bankWithdrawExpense = 0
  let deliveryAppFeeExpense = 0
  let cardFeeExpense = 0
  let fixedExpenses = 0
  let stockInboundExpense = 0
  let payrollExpense = 0
  let payrollCashDeduped = 0
  let skippedNonPlExpense = 0
  let bankCategoryFixedExpense = 0
  let beginningInventory = 0
  let endingInventory = 0
  const expenseBySubjectMap = new Map<number | null, number>()
  const expenseVatBySubjectMap = new Map<number | null, number>()
  const purchaseVendorVatMapAccum: Record<string, number> = {}

  const payrollAgg = await loadPayrollAggregateForIncomeStatement({
    yearMonth,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  if (payrollAgg.total > 0) {
    payrollExpense = payrollAgg.total
    addToSubjectMap(expenseBySubjectMap, payrollAgg.preferredSubjectId, payrollAgg.total)
  }
  const payrollPayWindowEndStr = plFetchEndStrWithPayrollPayWindow(endStr)

  const feeAccrualPl = await loadDeliveryCardFeeAccrualsForPl({
    startStr,
    endStr,
    storeFilter,
    isHQ,
    subjectMeta,
  })
  mergeExpenseSubjectMaps(expenseBySubjectMap, feeAccrualPl.bySubject)
  mergeExpenseSubjectMaps(expenseVatBySubjectMap, feeAccrualPl.bySubjectVat)
  cashExpenseVat += feeAccrualPl.cashExpenseVat
  deliveryAppFeeExpense += feeAccrualPl.deliveryAppFees
  cardFeeExpense += feeAccrualPl.cardFees
  const feeAccrualLinkedBankIds = feeAccrualPl.linkedBankTransactionIds
  const feeAccountSubjectIds = new Set(feeAccountSubjectIdsFromMeta(subjectMeta).allIds)
  limits.delivery_card_fee_accruals = {
    fetched: feeAccrualPl.fetched,
    limit: ACCOUNTING_ROWS_MAX,
  }

  const cardBillPl = await loadCardBillAllocationLinesForPl({
    startStr,
    endStr,
    storeFilter,
    isHQ,
  })
  const cardBillLinkedBankIds = cardBillPl.linkedBankTransactionIds
  const cardBillPurchaseVendorMap: Record<string, number> = {}
  const cardBillPurchaseVendorVatMap: Record<string, number> = {}
  for (const line of cardBillPl.lines) {
    addBankExpenseWithdrawToPl({
      row: {
        amount: line.amount,
        vat_amount: line.vatAmount,
        account_subject_id: line.accountSubjectId,
        vendor_code: line.vendorCode,
        memo: line.memo,
      },
      subjectMeta,
      purchaseVendorMap: cardBillPurchaseVendorMap,
      purchaseVendorVatMap: cardBillPurchaseVendorVatMap,
      cashVendorKeys: bankPurchaseVendorKeys,
      expenseBySubjectMap,
      expenseVatBySubjectMap,
      onExpense: (amt) => {
        bankWithdrawExpense += amt
      },
      onExpenseVat: (vat) => {
        cashExpenseVat += vat
      },
      onPurchase: (amt) => {
        purchasesBankGross += amt
        purchases += amt
      },
      onPurchaseVat: (vat) => {
        purchasesBankVat += vat
      },
      onSkippedNonPl: (amt) => {
        skippedNonPlExpense += amt
      },
    })
  }
  limits.card_bill_allocation = {
    fetched: cardBillPl.fetched,
    limit: ACCOUNTING_ROWS_MAX,
  }

  const franchiseBillingPl = await loadFranchiseBillingForIncomeStatement({
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    isHQ,
  })
  limits.franchise_billing_pos = {
    fetched: franchiseBillingPl.fetched,
    limit: ACCOUNTING_ROWS_MAX,
  }
  const franchiseExpense: FranchiseBillingPlSlice = franchiseBillingPl.expense
  const franchiseRevenue: FranchiseBillingPlSlice = franchiseBillingPl.revenue

  const classifySalaryCashForPl = (row: {
    account_subject_id?: number | null
    memo?: string | null
    amount?: number
    trans_date?: string | null
    expense_date?: string | null
  }) => {
    const decision = resolveSalaryCashPlDecision({
      isSalaryLike: isSalaryLikePlExpenseRow({
        accountSubjectId: row.account_subject_id,
        memo: row.memo,
        subjectMeta,
        salarySubjectIds: payrollAgg.salarySubjectIds,
      }),
      payrollExpenseThisMonth: payrollExpense,
      transDate: row.trans_date,
      expenseDate: row.expense_date,
      plYearMonth: yearMonth,
    })
    if (decision === 'skip-payroll-dup') {
      payrollCashDeduped += Math.abs(Number(row.amount) || 0)
    }
    return decision
  }

  let ordersPurchaseSubtotal = 0
  let purchaseByVendor: IncomeStatementLineDetail[] = []
  let salesByCustomer: IncomeStatementLineDetail[] = []
  let salesByDay: IncomeStatementLineDetail[] = []
  let purchaseHqOutboundBasis:
    | { outboundTotal: number; approvedOrdersTotal: number; diff: number }
    | undefined = undefined
  let hqOutboundDuplicateLinesDeduped = 0
  let purchaseExcludedHqBankPayments: { key: string; amount: number; label?: string }[] | undefined = undefined
  const excludedHqVendorDupRaw: { key: string; amount: number }[] = []

  if (isHQ) {
    const hqSalesAgg = await sumHqOutboundSalesMatchingOutboundManagement({
      startStr,
      endStr,
      storeFilter,
    })
    sales += hqSalesAgg.salesTotal
    salesNetForDisplay += hqSalesAgg.salesTotal
    salesByCustomer = hqSalesAgg.salesByCustomer.map((row) => ({
      ...row,
      amountBasis: 'stock_net' as const,
    }))
    limits.hq_outbound_sales = {
      fetched: hqSalesAgg.lineCount,
      limit: ACCOUNTING_ROWS_MAX,
    }
    if (hqSalesAgg.hitRowCap) {
      warnings.push(
        '본사 매출(물류 출고) 조회가 상한에 도달해 매출이 과소할 수 있습니다. 출고 관리와 동일 기준입니다.'
      )
    }

    const [inboundHq, vendorPurchaseKeyIndex] = await Promise.all([
      getDirectInboundPurchasesByVendor(
        '입고등록',
        startStr,
        endStr,
        itemUnitCostMap,
        {},
        itemAccountSubjectMap,
        subjectMeta,
        itemTaxMap
      ),
      loadVendorPurchaseKeyIndex(),
    ])
    const inboundByVendorHq = normalizeVendorAmountMap(inboundHq.byVendor, vendorPurchaseKeyIndex)
    directInboundVatBuckets = mergeVatBucketsForKeys(
      inboundHq.vatBucketsByVendor,
      Object.keys(inboundHq.byVendor)
    )
    for (const row of inboundHq.excludedHq) excludedHqVendorDupRaw.push(row)
    const bankPayHqFetch = await fetchBankPurchasePaymentsByVendor({
      isHQ: true,
      storeFilter,
      startStr,
      endStr,
    })
    limits.bank_purchase_payment = {
      fetched: bankPayHqFetch.fetched,
      limit: ACCOUNTING_ROWS_MAX,
    }
    if (bankPayHqFetch.truncated) {
      warnings.push(
        `통장 매입 대금 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 매입이 과소할 수 있습니다.`
      )
    }
    const bankPayByVendorHqNorm = normalizeVendorAmountMap(bankPayHqFetch.byVendor, vendorPurchaseKeyIndex)
    const bankPayVatHqNorm = normalizeVendorAmountMap(bankPayHqFetch.byVendorVat, vendorPurchaseKeyIndex)
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorHq,
      bankPayByVendorHqNorm
    )
    const bankPayByVendorHq = excludeBankPurchasesWhenDirectInboundPresent(
      inboundByVendorHq,
      bankPayByVendorHqNorm
    )
    const bankPayVatByVendorHq = pickVendorVatForKeptAmounts(bankPayVatHqNorm, bankPayByVendorHq)
    const purchaseVendorMapHq: Record<string, number> = { ...inboundByVendorHq }
    mergeVendorAmountMap(purchaseVendorMapHq, bankPayByVendorHq)
    mergeVendorAmountMap(purchaseVendorMapHq, cardBillPurchaseVendorMap)
    mergeVendorAmountMap(purchaseVendorVatMapAccum, bankPayVatByVendorHq)
    mergeVendorAmountMap(purchaseVendorVatMapAccum, cardBillPurchaseVendorVatMap)
    /** 본사 매입: 직접입고 + 그 달에 입고가 없는 거래처의 통장 매입 대금(인식일) */
    const inboundHqTotal = Object.values(inboundByVendorHq).reduce((a, b) => a + b, 0)
    const bankHqTotal = sumVendorMap(bankPayByVendorHq)
    for (const k of Object.keys(bankPayByVendorHq)) bankPurchaseVendorKeys.add(k)
    purchasesStockNet += inboundHqTotal
    purchasesBankGross += bankHqTotal
    purchasesBankVat += sumVendorMap(bankPayVatByVendorHq)
    purchases += inboundHqTotal + bankHqTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, inboundHq.expenseBySubject)
    stockInboundExpense += sumExpenseSubjectAmounts(inboundHq.expenseBySubject)

    const pettyAll = (await supabaseSelectFilterAllPages(
      'petty_cash_transactions',
      `trans_date=gte.${startStr}&trans_date=lte.${payrollPayWindowEndStr}&trans_type=eq.expense`,
      {
        select: 'store,amount,vat_amount,trans_type,account_subject_id,vendor_code,memo,trans_date',
        order: 'id.asc',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as {
      store?: string
      amount?: number
      vat_amount?: number | null
      trans_type?: string
      account_subject_id?: number | null
      vendor_code?: string | null
      memo?: string | null
      trans_date?: string | null
    }[]
    for (const r of pettyAll || []) {
      const st = String(r.store || '').trim()
      if (!isHqAccountingStoreRow(st)) continue
      const salaryDecision = classifySalaryCashForPl(r)
      if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
      if (salaryDecision === 'not-salary') {
        const td = String(r.trans_date || '').slice(0, 10)
        if (td < startStr || td > endStr) continue
      }
      addPettyCashRowToPl({
        row: r,
        subjectMeta,
        purchaseVendorMap: purchaseVendorMapHq,
        purchaseVendorVatMap: purchaseVendorVatMapAccum,
        cashVendorKeys: bankPurchaseVendorKeys,
        expenseBySubjectMap,
        expenseVatBySubjectMap,
        onExpense: (amt) => {
          pettyCashExpense += amt
        },
        onExpenseVat: (vat) => {
          cashExpenseVat += vat
        },
        onPurchase: (amt) => {
          purchasesBankGross += amt
          purchases += amt
        },
        onPurchaseVat: (vat) => {
          purchasesBankVat += vat
        },
        onSkippedNonPl: (amt) => {
          skippedNonPlExpense += amt
        },
      })
    }
    limits.petty_cash = { fetched: pettyAll?.length || 0, limit: ACCOUNTING_ROWS_MAX }
    if ((pettyAll?.length || 0) >= ACCOUNTING_ROWS_MAX) {
      warnings.push(`패티캐시 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`)
    }

    try {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id,store', limit: 2000 })) as { id?: number; store?: string }[] | null
      const hqAccountIds = (bankAccRows || [])
        .filter((a) => isHqAccountingStoreRow(String(a.store || '')))
        .map((a) => a.id)
        .filter((id): id is number => id != null)
      if (hqAccountIds.length > 0) {
        const { rows: btRows, fetched, truncated } = await fetchBankWithdrawRowsForPl(
          hqAccountIds,
          startStr,
          payrollPayWindowEndStr,
          { feeAccountSubjectIds }
        )
        const accrualVatByBank = await loadExpenseAccrualVatByBankIds(
          btRows.map((r) => Number(r.id || 0)).filter((id) => id > 0)
        )
        for (const r of btRows) {
          const bankId = Number(r.id || 0)
          if (bankId > 0 && feeAccrualLinkedBankIds.has(bankId)) continue
          if (bankId > 0 && cardBillLinkedBankIds.has(bankId)) continue
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const salaryDecision = classifySalaryCashForPl(r)
          if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
          if (salaryDecision === 'not-salary') {
            if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
          }
          if (cat === 'fixed') bankCategoryFixedExpense += Math.abs(Number(r.amount) || 0)
          const accrual = bankId > 0 ? accrualVatByBank.get(bankId) : undefined
          const resolved = resolveBankPlCashVat({
            bankAmount: Number(r.amount) || 0,
            bankVatAmount: r.vat_amount,
            accrualGross: accrual?.gross,
            accrualVat: accrual?.vat,
          })
          addBankExpenseWithdrawToPl({
            row: r,
            subjectMeta,
            purchaseVendorMap: purchaseVendorMapHq,
            purchaseVendorVatMap: purchaseVendorVatMapAccum,
            cashVendorKeys: bankPurchaseVendorKeys,
            expenseBySubjectMap,
            expenseVatBySubjectMap,
            resolvedVat: resolved.vat,
            onExpense: (amt) => {
              bankWithdrawExpense += amt
            },
            onExpenseVat: (vat) => {
              cashExpenseVat += vat
            },
            onPurchase: (amt) => {
              purchasesBankGross += amt
              purchases += amt
            },
            onPurchaseVat: (vat) => {
              purchasesBankVat += vat
            },
            onDeliveryFee: (amt) => {
              deliveryAppFeeExpense += amt
            },
            onCardFee: (amt) => {
              cardFeeExpense += amt
            },
            onSkippedNonPl: (amt) => {
              skippedNonPlExpense += amt
            },
          })
        }
        limits.bank_withdraw = { fetched, limit: ACCOUNTING_ROWS_MAX }
        if (truncated) {
          warnings.push(
            `통장 출금 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`
          )
        }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    {
      const fx = await getFixedExpensesAggregate(storeFilter, yearMonth, true)
      fixedExpenses += fx.total
      mergeExpenseSubjectMaps(expenseBySubjectMap, fx.byAccountSubjectId)
    }
    beginningInventory = await getInventoryValue('본사', startStr, true, itemUnitCostMap, false)
    endingInventory = await getInventoryValue('본사', endStr, false, itemUnitCostMap, false)
    purchaseByVendor = Object.entries(purchaseVendorMapHq)
      .filter(([, v]) => v > 0)
      .map(([key, amount]) => {
        const vat = Math.max(0, Number(purchaseVendorVatMapAccum[key]) || 0)
        return vat > 0 ? { key, amount, vatAmount: round2(vat) } : { key, amount }
      })
      .sort((a, b) => b.amount - a.amount)
  } else {
    const posSalesSum = await sumCompletedPosSalesTotal({
      startStr,
      endStr,
      storeFilter,
      tenantId: input.tenantId,
    })
    sales += posSalesSum.total
    salesNetForDisplay += posSalesSum.totalNet
    salesGrossForDisplay += posSalesSum.total
    salesByDay = posSalesSum.salesByDay
      .filter((r) => r.amount > 0)
      .map((r) => ({
        key: r.key,
        amount: r.amount,
        label: r.label,
        amountBasis: 'pos_gross' as const,
      }))
    limits.pos_orders = {
      fetched: posSalesSum.completedCount,
      limit: 2_000_000,
    }
    if (posSalesSum.truncated) {
      warnings.push(
        'pos_orders 조회가 상한에 도달해 매출이 과소할 수 있습니다. (매출 관리와 동일 영업일 기준)'
      )
    }

    const orderFilter =
      `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endStr)}&status=eq.Approved` +
      (storeFilter !== 'All' ? `&${buildStoreFieldOrIlikeFragment('store_name', storeFilter)}` : '')
    const [orders, hqVendorIndex, vendorPurchaseKeyIndexStore] = await Promise.all([
      supabaseSelectFilterAllPages('orders', orderFilter, {
        select: 'total',
        pageSize: 8000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }) as Promise<{ total?: number }[]>,
      loadHqVendorMatchIndex(),
      loadVendorPurchaseKeyIndex(),
    ])
    let hqOutboundAgg: {
      purchaseTotal: number
      expenseBySubject: Map<number | null, number>
      truncated?: boolean
      dedupedDuplicateCount?: number
    }
    try {
      hqOutboundAgg = await sumHqOutboundPurchaseFromOffice(
        storeFilter === 'All' ? null : storeFilter,
        startStr,
        endStr
      )
    } catch (e) {
      warnings.push(
        `본사 창고 출고(매입) 조회 실패 — 해당 금액을 0으로 처리했습니다. (${String(e).slice(0, 120)})`
      )
      hqOutboundAgg = { purchaseTotal: 0, expenseBySubject: new Map(), truncated: false }
    }
    let ordersApprovedSubtotal = 0
    for (const o of orders) ordersApprovedSubtotal += Number(o.total) || 0
    limits.orders_purchase = { fetched: orders.length, limit: ACCOUNTING_ROWS_MAX }
    if (orders.length >= ACCOUNTING_ROWS_MAX) {
      warnings.push('orders(승인 발주) 조회 상한에 도달해 참고 합계가 과소할 수 있습니다.')
    }
    try {
      const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
      const obFilter = buildHqOutboundFromOfficeFilter(
        storeFilter === 'All' ? null : storeFilter,
        dayStartUtcIso,
        nextDayStartUtcIso
      )
      const obCount = await supabaseCountFilter('stock_logs', obFilter)
      limits.hq_outbound = { fetched: obCount, limit: BASE_LIMIT }
    } catch {
      limits.hq_outbound = { fetched: 0, limit: BASE_LIMIT }
    }

    ordersPurchaseSubtotal = hqOutboundAgg.purchaseTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, hqOutboundAgg.expenseBySubject)
    if (hqOutboundAgg.truncated) {
      warnings.push('stock_logs(본사 창고 출고) 조회 상한에 도달해 매입이 과소할 수 있습니다.')
    }
    if ((hqOutboundAgg.dedupedDuplicateCount || 0) > 0) {
      hqOutboundDuplicateLinesDeduped = hqOutboundAgg.dedupedDuplicateCount || 0
      warnings.push(
        `본사 창고 출고 중복 stock_logs ${hqOutboundDuplicateLinesDeduped}건을 손익 매입에서 제외했습니다. (동일 발주 수령 이중 기록 가능)`
      )
    }
    purchaseHqOutboundBasis = {
      outboundTotal: hqOutboundAgg.purchaseTotal,
      approvedOrdersTotal: ordersApprovedSubtotal,
      diff: round2(hqOutboundAgg.purchaseTotal - ordersApprovedSubtotal),
    }

    const storeInboundOpts: DirectInboundPurchaseOpts = {
      excludeFromHqInbound: true,
      hqIndex: hqVendorIndex,
      ...(storeFilter === 'All' ? { excludeHqLocations: true } : {}),
    }
    let inboundStore: Awaited<ReturnType<typeof getDirectInboundPurchasesByVendor>>
    try {
      inboundStore = await getDirectInboundPurchasesByVendor(
        storeFilter !== 'All' ? storeFilter : null,
        startStr,
        endStr,
        itemUnitCostMap,
        storeInboundOpts,
        itemAccountSubjectMap,
        subjectMeta,
        itemTaxMap
      )
    } catch (e) {
      warnings.push(
        `직접 입고(매입) 조회 실패 — 해당 금액을 0으로 처리했습니다. (${String(e).slice(0, 120)})`
      )
      inboundStore = {
        byVendor: {},
        expenseBySubject: new Map(),
        vatBucketsByVendor: {},
        excludedHq: [],
      }
    }
    const { kept: inboundByVendorStore, excluded: inboundHqExcluded } = partitionPurchaseVendorMapByHqCodes(
      inboundStore.byVendor,
      hqVendorIndex
    )
    for (const row of inboundStore.excludedHq) excludedHqVendorDupRaw.push(row)
    for (const row of inboundHqExcluded) excludedHqVendorDupRaw.push(row)
    directInboundVatBuckets = mergeVatBucketsForKeys(
      inboundStore.vatBucketsByVendor,
      Object.keys(inboundByVendorStore)
    )
    const bankPayStoreFetch = await fetchBankPurchasePaymentsByVendor({
      isHQ: false,
      storeFilter,
      startStr,
      endStr,
    })
    limits.bank_purchase_payment = {
      fetched: bankPayStoreFetch.fetched,
      limit: ACCOUNTING_ROWS_MAX,
    }
    if (bankPayStoreFetch.truncated) {
      warnings.push(
        `통장 매입 대금 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 매입이 과소할 수 있습니다.`
      )
    }
    const bankPayByVendorStorePreHq: Record<string, number> = {}
    const bankPayVatByVendorStorePreHq: Record<string, number> = {}
    for (const [k, v] of Object.entries(bankPayStoreFetch.byVendor)) {
      const amt = Number(v) || 0
      if (amt <= 0) continue
      if (isHqVendorPurchaseKey(k, hqVendorIndex)) {
        excludedHqVendorDupRaw.push({ key: k, amount: amt })
        continue
      }
      bankPayByVendorStorePreHq[k] = amt
      const vat = Number(bankPayStoreFetch.byVendorVat[k]) || 0
      if (vat > 0) bankPayVatByVendorStorePreHq[k] = vat
    }
    const inboundByVendorStoreNorm = normalizeVendorAmountMap(inboundByVendorStore, vendorPurchaseKeyIndexStore)
    const bankPayByVendorStoreNorm = normalizeVendorAmountMap(
      bankPayByVendorStorePreHq,
      vendorPurchaseKeyIndexStore
    )
    const bankPayVatByVendorStoreNorm = normalizeVendorAmountMap(
      bankPayVatByVendorStorePreHq,
      vendorPurchaseKeyIndexStore
    )
    purchaseInboundBankOverlapVendorKeys = collectInboundBankOverlapVendorKeys(
      inboundByVendorStoreNorm,
      bankPayByVendorStoreNorm
    )
    const bankPayByVendorStore = excludeBankPurchasesWhenDirectInboundPresent(
      inboundByVendorStoreNorm,
      bankPayByVendorStoreNorm
    )
    const bankPayVatByVendorStore = pickVendorVatForKeptAmounts(
      bankPayVatByVendorStoreNorm,
      bankPayByVendorStore
    )
    const purchaseVendorMapStore: Record<string, number> = { ...inboundByVendorStoreNorm }
    mergeVendorAmountMap(purchaseVendorMapStore, bankPayByVendorStore)
    mergeVendorAmountMap(purchaseVendorMapStore, cardBillPurchaseVendorMap)
    mergeVendorAmountMap(purchaseVendorVatMapAccum, bankPayVatByVendorStore)
    mergeVendorAmountMap(purchaseVendorVatMapAccum, cardBillPurchaseVendorVatMap)
    /** 본사 출고 + 직접입고 + 입고 없는 거래처의 통장 매입 대금(인식일, 없으면 출금일) */
    const inboundStoreTotal = Object.values(inboundByVendorStoreNorm).reduce((a, b) => a + b, 0)
    const bankStoreTotal = sumVendorMap(bankPayByVendorStore)
    for (const k of Object.keys(bankPayByVendorStore)) bankPurchaseVendorKeys.add(k)
    purchasesStockNet += ordersPurchaseSubtotal + inboundStoreTotal
    purchasesBankGross += bankStoreTotal
    purchasesBankVat += sumVendorMap(bankPayVatByVendorStore)
    purchases += ordersPurchaseSubtotal + inboundStoreTotal + bankStoreTotal
    mergeExpenseSubjectMaps(expenseBySubjectMap, inboundStore.expenseBySubject)
    stockInboundExpense += sumExpenseSubjectAmounts(inboundStore.expenseBySubject)

    let pettyFilter = `trans_date=gte.${startStr}&trans_date=lte.${payrollPayWindowEndStr}&trans_type=eq.expense`
    if (storeFilter !== 'All') {
      pettyFilter += `&${buildStoreFieldOrIlikeFragment('store', storeFilter)}`
    }
    const pettyRows = (await supabaseSelectFilterAllPages('petty_cash_transactions', pettyFilter, {
      select: 'amount,vat_amount,trans_type,account_subject_id,vendor_code,memo,trans_date',
      order: 'id.asc',
      pageSize: 8000,
      maxRows: ACCOUNTING_ROWS_MAX,
    })) as {
      amount?: number
      vat_amount?: number | null
      trans_type?: string
      account_subject_id?: number | null
      vendor_code?: string | null
      memo?: string | null
      trans_date?: string | null
    }[]
    for (const r of pettyRows || []) {
      const salaryDecision = classifySalaryCashForPl(r)
      if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
      if (salaryDecision === 'not-salary') {
        const td = String(r.trans_date || '').slice(0, 10)
        if (td < startStr || td > endStr) continue
      }
      addPettyCashRowToPl({
        row: r,
        subjectMeta,
        purchaseVendorMap: purchaseVendorMapStore,
        purchaseVendorVatMap: purchaseVendorVatMapAccum,
        cashVendorKeys: bankPurchaseVendorKeys,
        expenseBySubjectMap,
        expenseVatBySubjectMap,
        onExpense: (amt) => {
          pettyCashExpense += amt
        },
        onExpenseVat: (vat) => {
          cashExpenseVat += vat
        },
        onPurchase: (amt) => {
          purchasesBankGross += amt
          purchases += amt
        },
        onPurchaseVat: (vat) => {
          purchasesBankVat += vat
        },
        onSkippedNonPl: (amt) => {
          skippedNonPlExpense += amt
        },
      })
    }
    limits.petty_cash = { fetched: pettyRows?.length || 0, limit: ACCOUNTING_ROWS_MAX }
    if ((pettyRows?.length || 0) >= ACCOUNTING_ROWS_MAX) {
      warnings.push(`패티캐시 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`)
    }

    try {
      const bankAccRows = storeFilter !== 'All'
        ? ((await supabaseSelectFilter(
            'bank_accounts',
            buildStoreFieldOrIlikeFragment('store', storeFilter),
            { select: 'id', limit: 2000 }
          )) as { id?: number }[] | null)
        : ((await supabaseSelect('bank_accounts', { select: 'id', limit: 2000 })) as { id?: number }[] | null)
      const accountIds = (bankAccRows || []).map((a) => a.id).filter((id): id is number => id != null)
      if (accountIds.length > 0) {
        const { rows: btRows, fetched, truncated } = await fetchBankWithdrawRowsForPl(
          accountIds,
          startStr,
          payrollPayWindowEndStr,
          { feeAccountSubjectIds }
        )
        const accrualVatByBank = await loadExpenseAccrualVatByBankIds(
          btRows.map((r) => Number(r.id || 0)).filter((id) => id > 0)
        )
        for (const r of btRows) {
          const bankId = Number(r.id || 0)
          if (bankId > 0 && feeAccrualLinkedBankIds.has(bankId)) continue
          if (bankId > 0 && cardBillLinkedBankIds.has(bankId)) continue
          const cat = String(r.category || 'expense').toLowerCase()
          if (['transfer', 'correction', 'loan', 'advance', 'unclassified', 'purchase_payment'].includes(cat)) continue
          const salaryDecision = classifySalaryCashForPl(r)
          if (salaryDecision === 'skip-payroll-dup' || salaryDecision === 'skip-other-month') continue
          if (salaryDecision === 'not-salary') {
            if (!bankExpenseInPlPeriod(String(r.trans_date || ''), r.expense_date, startStr, endStr)) continue
          }
          if (cat === 'fixed') bankCategoryFixedExpense += Math.abs(Number(r.amount) || 0)
          const accrual = bankId > 0 ? accrualVatByBank.get(bankId) : undefined
          const resolved = resolveBankPlCashVat({
            bankAmount: Number(r.amount) || 0,
            bankVatAmount: r.vat_amount,
            accrualGross: accrual?.gross,
            accrualVat: accrual?.vat,
          })
          addBankExpenseWithdrawToPl({
            row: r,
            subjectMeta,
            purchaseVendorMap: purchaseVendorMapStore,
            purchaseVendorVatMap: purchaseVendorVatMapAccum,
            cashVendorKeys: bankPurchaseVendorKeys,
            expenseBySubjectMap,
            expenseVatBySubjectMap,
            resolvedVat: resolved.vat,
            onExpense: (amt) => {
              bankWithdrawExpense += amt
            },
            onExpenseVat: (vat) => {
              cashExpenseVat += vat
            },
            onPurchase: (amt) => {
              purchasesBankGross += amt
              purchases += amt
            },
            onPurchaseVat: (vat) => {
              purchasesBankVat += vat
            },
            onDeliveryFee: (amt) => {
              deliveryAppFeeExpense += amt
            },
            onCardFee: (amt) => {
              cardFeeExpense += amt
            },
            onSkippedNonPl: (amt) => {
              skippedNonPlExpense += amt
            },
          })
        }
        limits.bank_withdraw = { fetched, limit: ACCOUNTING_ROWS_MAX }
        if (truncated) {
          warnings.push(
            `통장 출금 조회가 상한(${ACCOUNTING_ROWS_MAX})에 도달해 비용이 과소할 수 있습니다.`
          )
        }
      }
    } catch {
      warnings.push('bank_transactions 조회 실패로 일부 지출이 누락될 수 있습니다.')
    }

    {
      const fx = await getFixedExpensesAggregate(storeFilter, yearMonth, false)
      fixedExpenses += fx.total
      mergeExpenseSubjectMaps(expenseBySubjectMap, fx.byAccountSubjectId)
    }

    if (storeFilter !== 'All') {
      beginningInventory = await getInventoryValue(storeFilter, startStr, true, itemUnitCostMap, false)
      endingInventory = await getInventoryValue(storeFilter, endStr, false, itemUnitCostMap, false)
    } else {
      beginningInventory = await getInventoryValue(null, startStr, true, itemUnitCostMap, true)
      endingInventory = await getInventoryValue(null, endStr, false, itemUnitCostMap, true)
    }

    purchaseByVendor = []
    if (ordersPurchaseSubtotal > 0) {
      purchaseByVendor.push({ key: '__pl_hq_orders__', amount: ordersPurchaseSubtotal })
    }
    for (const [key, amount] of Object.entries(purchaseVendorMapStore)) {
      if (amount > 0) {
        const vat = Math.max(0, Number(purchaseVendorVatMapAccum[key]) || 0)
        purchaseByVendor.push(
          vat > 0 ? { key, amount, vatAmount: round2(vat) } : { key, amount }
        )
      }
    }
    purchaseByVendor.sort((a, b) => b.amount - a.amount)
  }

  // 승인 회계 PO(로열티·배달/Grab GP) — 발행측 매출 (displayAmounts는 VAT 버킷 확정 후 가산)
  if (franchiseRevenue.totalGross > 0 || franchiseRevenue.totalNet > 0) {
    sales += franchiseRevenue.totalGross
    // 매장 POS 일별(salesByDay) 우선권을 깨지 않도록 본사(또는 이미 매출처 분해)일 때만 행 추가
    if (isHQ || salesByCustomer.length > 0) {
      salesByCustomer = [
        ...salesByCustomer,
        {
          key: PL_FRANCHISE_BILLING_SALES_KEY,
          amount: franchiseRevenue.totalGross,
          amountBasis: 'pos_gross' as const,
        },
      ]
    }
  }

  if (input.includeDebug) {
    try {
      const countFilter =
        isHQ
          ? `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
          : `trans_date=gte.${startStr}&trans_date=lte.${endStr}&trans_type=eq.expense`
      const pettyTotalCount = await supabaseCountFilter('petty_cash_transactions', countFilter)
      if (limits.petty_cash) limits.petty_cash.total = pettyTotalCount
    } catch {
      // ignore diagnostics errors
    }
  }

  if (payrollCashDeduped > 0) {
    warnings.push(
      `확정 급여(근태 귀속월)가 손익에 반영되어, 익월 지급분 통장·패티 급여성 출금 약 ฿${Math.round(payrollCashDeduped).toLocaleString('en-US')}은 이중 방지를 위해 제외했습니다.`
    )
  }
  if (skippedNonPlExpense > 0) {
    warnings.push(
      `손익 제외(이체·자산·부채 등 비비용 계정) 출금 약 ฿${Math.round(skippedNonPlExpense).toLocaleString('en-US')} — 통장 용도·계정을 확인하세요.`
    )
  }
  if (bankCategoryFixedExpense > 0 && fixedExpenses > 0) {
    warnings.push(
      `통장 용도「고정비」출금(약 ฿${Math.round(bankCategoryFixedExpense).toLocaleString('en-US')})과 고정비 월정액(฿${Math.round(fixedExpenses).toLocaleString('en-US')})이 함께 반영되어 이중일 수 있습니다.`
    )
  }

  const [depAgg, pp30VatRemittance] = await Promise.all([
    sumDepreciationForIncomeStatement(yearMonth, storeFilter, isHQ, subjectMeta),
    loadPp30VatRemittanceForIncomeStatement({
      startStr,
      endStr,
      storeFilter,
      isHQ,
    }),
  ])
  const depreciationExpense = depAgg.total
  if (depreciationExpense > 0) {
    mergeExpenseSubjectMaps(expenseBySubjectMap, depAgg.byAccountSubjectId)
  }

  const expenseByAccountSubject = appendPp30ExpenseSubject(
    appendFranchiseBillingExpenseSubjects(
      buildExpenseByAccountList(expenseBySubjectMap, subjectMeta, expenseVatBySubjectMap),
      franchiseExpense
    ),
    pp30VatRemittance
  )
  /** petty·통장·고정비·급여·감가상각·입고(비용 계정 품목) 등 + 승인 회계 PO 가맹 청구 */
  const expensesFromSubjects = sumExpenseSubjectAmounts(expenseBySubjectMap)
  const franchiseRoyaltyExpense = franchiseExpense.royaltyGross
  const franchiseDeliveryGpExpense = franchiseExpense.deliveryGpGross
  const franchiseGrabGpExpense = franchiseExpense.grabGpGross
  const franchiseBillingCombinedExpense = franchiseExpense.combinedGross
  const franchiseBillingExpenseGross = franchiseExpense.totalGross
  const franchiseBillingExpenseNet = franchiseExpense.totalNet
  const expenses = round2(expensesFromSubjects + franchiseBillingExpenseGross)
  const cogs = beginningInventory + purchases - endingInventory
  const grossProfit = sales - cogs
  const netProfit = grossProfit - expenses

  const begInvNet = beginningInventory
  const endInvNet = endingInventory

  let salesStockVatBuckets = emptyNetVatBuckets()
  let purchasesStockVatBuckets = emptyNetVatBuckets()

  if (isHQ) {
    salesStockVatBuckets = await getHqOutboundSalesVatBuckets(storeFilter, startStr, endStr, itemTaxMap)
    purchasesStockVatBuckets = directInboundVatBuckets
  } else {
    const hqPurchaseBuckets = await getHqOutboundPurchaseVatBuckets(
      storeFilter === 'All' ? null : storeFilter,
      startStr,
      endStr,
      itemTaxMap
    )
    purchasesStockVatBuckets = mergeNetVatBuckets(directInboundVatBuckets, hqPurchaseBuckets)
  }

  const begInvBuckets = await getInventoryVatBuckets(
    isHQ ? '본사' : storeFilter !== 'All' ? storeFilter : null,
    startStr,
    true,
    itemUnitCostMap,
    itemTaxMap,
    !isHQ && storeFilter === 'All',
    input.tenantId
  )
  const endInvBuckets = await getInventoryVatBuckets(
    isHQ ? '본사' : storeFilter !== 'All' ? storeFilter : null,
    endStr,
    false,
    itemUnitCostMap,
    itemTaxMap,
    !isHQ && storeFilter === 'All',
    input.tenantId
  )

  if (isHQ) {
    salesNetForDisplay = netTotalFromBuckets(salesStockVatBuckets)
    salesGrossForDisplay = grossFromNetVatBuckets(salesStockVatBuckets)
  }
  // 승인 회계 PO 가맹 청구 매출(발행측) — 물류 출고 VAT 버킷과 별도 가산
  if (franchiseRevenue.totalGross > 0 || franchiseRevenue.totalNet > 0) {
    salesGrossForDisplay = round2(salesGrossForDisplay + franchiseRevenue.totalGross)
    salesNetForDisplay = round2(salesNetForDisplay + franchiseRevenue.totalNet)
  }
  if (salesNetForDisplay <= 0 && sales > 0) {
    salesNetForDisplay = sales
    salesGrossForDisplay = salesGrossForDisplay > 0 ? salesGrossForDisplay : sales
  }
  if (salesGrossForDisplay <= 0 && sales > 0) salesGrossForDisplay = sales

  const purchasesBankVatRounded = round2(purchasesBankVat)
  const purchasesNetForDisplay = round2(
    purchasesStockNet + Math.max(0, purchasesBankGross - purchasesBankVatRounded)
  )
  const purchasesGrossForDisplay = round2(
    grossFromNetVatBuckets(purchasesStockVatBuckets) + purchasesBankGross
  )

  const displayAmounts: IncomeStatementDisplayAmounts = {
    salesGross: round2(salesGrossForDisplay),
    salesNet: round2(salesNetForDisplay),
    purchasesGross: purchasesGrossForDisplay,
    purchasesNet: purchasesNetForDisplay,
    beginningInventoryGross: grossFromNetVatBuckets(begInvBuckets),
    beginningInventoryNet: round2(begInvNet),
    endingInventoryGross: grossFromNetVatBuckets(endInvBuckets),
    endingInventoryNet: round2(endInvNet),
    franchiseBillingGross: franchiseBillingExpenseGross,
    franchiseBillingNet: franchiseBillingExpenseNet,
    franchiseRoyaltyGross: franchiseExpense.royaltyGross,
    franchiseRoyaltyNet: franchiseExpense.royaltyNet,
    franchiseDeliveryGpGross: franchiseExpense.deliveryGpGross,
    franchiseDeliveryGpNet: franchiseExpense.deliveryGpNet,
    franchiseGrabGpGross: franchiseExpense.grabGpGross,
    franchiseGrabGpNet: franchiseExpense.grabGpNet,
    franchiseBillingCombinedGross: franchiseExpense.combinedGross,
    franchiseBillingCombinedNet: franchiseExpense.combinedNet,
    franchiseRevenueGross: franchiseRevenue.totalGross,
    franchiseRevenueNet: franchiseRevenue.totalNet,
    expensesCashVat: round2(cashExpenseVat),
    purchasesBankVat: purchasesBankVatRounded,
    pp30Remittance: round2(pp30VatRemittance),
    ...(isHQ ? { salesStockVatBuckets } : {}),
    purchasesStockVatBuckets,
  }

  const depreciation = depreciationExpense
  const ebitdaAdds = sumEbitdaAddBacksFromExpenseSubjects(expenseByAccountSubject)
  const ebitdaBridge: IncomeStatementEbitdaBridge = {
    depreciation,
    interest: ebitdaAdds.interest,
    incomeTax: ebitdaAdds.incomeTax,
  }

  const vendorNormToName = await loadVendorCodeNormToNameMap()
  purchaseByVendor = tagPurchaseVendorBasis(
    enrichPurchaseByVendorLabels(purchaseByVendor, vendorNormToName),
    bankPurchaseVendorKeys
  )
  if (excludedHqVendorDupRaw.length > 0) {
    purchaseExcludedHqBankPayments = excludedHqVendorDupRaw.map(({ key, amount }) => ({
      key,
      amount: round2(amount),
      label: vendorNormToName[key.toLowerCase()],
    }))
  }

  return {
    yearMonth,
    startStr,
    endStr,
    storeFilter,
    timezone: 'Asia/Bangkok',
    sales,
    purchases,
    beginningInventory,
    endingInventory,
    cogs,
    expenses,
    grossProfit,
    netProfit,
    expenseBreakdown: {
      pettyCash: pettyCashExpense,
      bankWithdraw: bankWithdrawExpense,
      deliveryAppFees: deliveryAppFeeExpense,
      cardFees: cardFeeExpense,
      fixedExpenses,
      stockInboundExpense: round2(stockInboundExpense),
      payrollExpense: round2(payrollExpense),
      depreciationExpense: round2(depreciationExpense),
      franchiseRoyalty: round2(franchiseRoyaltyExpense),
      franchiseDeliveryGp: round2(franchiseDeliveryGpExpense),
      franchiseGrabGp: round2(franchiseGrabGpExpense),
      franchiseBillingCombined: round2(franchiseBillingCombinedExpense),
      pp30VatRemittance: round2(pp30VatRemittance),
      total: expenses,
    },
    expenseByAccountSubject,
    purchaseByVendor,
    salesByCustomer,
    ...(salesByDay.length > 0 ? { salesByDay } : {}),
    displayAmounts,
    ebitdaBridge,
    diagnostics:
      input.includeDebug ||
      warnings.length > 0 ||
      purchaseInboundBankOverlapVendorKeys.length > 0 ||
      purchaseHqOutboundBasis != null ||
      hqOutboundDuplicateLinesDeduped > 0 ||
      (purchaseExcludedHqBankPayments?.length ?? 0) > 0
        ? {
            warnings,
            limits,
            ...(purchaseInboundBankOverlapVendorKeys.length > 0
              ? { purchaseInboundBankOverlapVendorKeys }
              : {}),
            ...(purchaseHqOutboundBasis ? { purchaseHqOutboundBasis } : {}),
            ...(hqOutboundDuplicateLinesDeduped > 0 ? { hqOutboundDuplicateLinesDeduped } : {}),
            ...(purchaseExcludedHqBankPayments?.length ? { purchaseExcludedHqBankPayments } : {}),
          }
        : undefined,
  }
}

export function getMonthsFromYearStart(yearMonth: string): string[] {
  const y = Number(yearMonth.slice(0, 4))
  const m = Number(yearMonth.slice(5, 7))
  const months: string[] = []
  for (let mm = 1; mm <= m; mm++) {
    months.push(`${y}-${String(mm).padStart(2, '0')}`)
  }
  return months
}

/** 월별 손익 1건이 Supabase 조회를 여러 번 하므로 병렬은 소수로 제한 (maxDuration 120초 내 연초~12월) */
export const MONTHLY_INCOME_REPORT_CONCURRENCY = 3

const INCOME_REPORT_SHARE_TTL_MS = 30_000
const INCOME_REPORT_SHARE_MAX_ENTRIES = 200
const incomeReportShare = new Map<string, { at: number; promise: Promise<IncomeStatementReport> }>()

/**
 * 같은 인스턴스에 동시에 들어온 대차대조표(월별 비교 → 월마다 연초~해당월)·관리마진 요청이
 * 동일 조건의 월 손익을 반복 계산하지 않도록 진행 중·직후(30초) 결과를 공유한다.
 */
export function computeIncomeStatementReportShared(input: IncomeScopeInput): Promise<IncomeStatementReport> {
  const key = JSON.stringify([
    input.yearMonth ?? null,
    input.storeFilter ?? null,
    input.userStore ?? null,
    input.userRole ?? null,
    input.allowedStores ?? null,
    input.tenantId ?? null,
    Boolean(input.includeDebug),
  ])
  const now = Date.now()
  const hit = incomeReportShare.get(key)
  if (hit && now - hit.at < INCOME_REPORT_SHARE_TTL_MS) return hit.promise

  if (incomeReportShare.size >= INCOME_REPORT_SHARE_MAX_ENTRIES) {
    for (const [k, v] of incomeReportShare) {
      if (now - v.at >= INCOME_REPORT_SHARE_TTL_MS) incomeReportShare.delete(k)
    }
    while (incomeReportShare.size >= INCOME_REPORT_SHARE_MAX_ENTRIES) {
      const oldest = incomeReportShare.keys().next().value
      if (oldest === undefined) break
      incomeReportShare.delete(oldest)
    }
  }

  const promise = computeIncomeStatementReport(input)
  incomeReportShare.set(key, { at: now, promise })
  promise.catch(() => {
    if (incomeReportShare.get(key)?.promise === promise) incomeReportShare.delete(key)
  })
  return promise
}
