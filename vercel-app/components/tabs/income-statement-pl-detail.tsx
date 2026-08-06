"use client"

import * as React from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getIncomeStatementExpenseDrillDown,
  getIncomeStatementPurchaseDrillDown,
  type IncomeStatementData,
  type IncomeStatementExpenseDrillDown,
  type IncomeStatementPurchaseDrillDown,
} from "@/lib/api-client"
import { formatAccountSubjectLabel } from "@/lib/account-subject-display"
import { isMaterialHqOutboundOrderDiff } from "@/lib/income-statement-hq-diff"
import { type IncomeStatementVatDisplayMode, pickFranchiseBillingVatAmount } from "@/lib/income-statement-display"
import { formatBahtInteger as formatBath } from "@/lib/financial-amount-format"
import {
  accountingPlCogsRowCn,
  accountingPlDeepIndentLabelCn,
  accountingPlDocumentCn,
  accountingPlExpenseRowCn,
  accountingPlGrossProfitRowCn,
  accountingPlIndentLabelCn,
  accountingPlInventoryRowCn,
  accountingPlNetProfitRowCn,
  accountingPlSalesRowCn,
  accountingPlSubRowCn,
  accountingPlSubTdLabelCn,
  accountingPlTableCn,
  accountingPlTableShellCn,
  accountingPlTbodyCn,
  accountingPlTdAmountCn,
  accountingPlTdLabelCn,
  accountingPlTdPctCn,
  accountingPlTheadCn,
  accountingPlThCn,
  accountingPlThRightCn,
  accountingPlTitleCn,
} from "@/lib/accounting-result-ui"
import { cn } from "@/lib/utils"
import { AccountingPeriodChip } from "@/components/admin/accounting-result-primitives"
import {
  lineDisplayAmount,
  purchaseVendorRowLabel,
  purchaseVendorLabelForKey,
  incomeStatementSalesBreakdown,
  salesBreakdownIsDaily,
  salesBreakdownIsHqOutbound,
  salesBreakdownRowLabel,
} from "./income-statement-tab-utils"
import { IncomePurchaseDrillDialog } from "./income-statement-purchase-drill-dialog"
import { IncomeExpenseDrillDialog } from "./income-statement-expense-drill-dialog"

export type IncomeStatementViewModel = {
  sales: number
  purchases: number
  grossProfit: number
  netProfit: number
  ebitda: number | null
  pct: (n: number) => string
  cogs: number
  beginningInventory: number
  endingInventory: number
  expenses: number
  useManualSales: boolean
  systemSales: number
  useManualBegInv: boolean
  systemBeginningInventory: number
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

export function IncomePlDetailTableContent({
  data,
  view,
  periodLine,
  vatMode,
  showEbitda,
  showExpenseDetails,
  expandSales,
  onToggleSales,
  expandPurchases,
  onTogglePurchases,
  expandExpenseAccounts,
  onToggleExpenseAccounts,
  printRef,
  purchaseDrillContext,
  titleClassName = accountingPlTitleCn,
  wrapperClassName = accountingPlDocumentCn,
}: {
  data: IncomeStatementData
  view: IncomeStatementViewModel
  periodLine: string
  vatMode: IncomeStatementVatDisplayMode
  showEbitda: boolean
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
      <div className="mb-5 space-y-2 border-b border-border/50 pb-4">
        <div className={titleClassName}>{t("incomeStatementTitle")}</div>
        <AccountingPeriodChip>{periodLine}</AccountingPeriodChip>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {vatMode === "included" ? t("pL_vatDisplayIncludedNote") : t("pL_vatDisplayExcludedNote")}
        </p>
      </div>
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
      <div className={accountingPlTableShellCn}>
      <table className={accountingPlTableCn}>
        <thead>
          <tr className={accountingPlTheadCn}>
            <th className={accountingPlThCn}></th>
            <th className={accountingPlThRightCn}>{t("pL_colAmount") || "Amount"}</th>
            <th className={accountingPlThRightCn}>{t("pL_pctOfSales")}</th>
          </tr>
        </thead>
        <tbody className={accountingPlTbodyCn}>
          {incomeStatementSalesBreakdown(data).length > 0 ? (
            <>
              <tr
                className={`${accountingPlSalesRowCn} cursor-pointer select-none`}
                onClick={onToggleSales}
                title={t("pL_clickToExpand") || ""}
              >
                <td className={`${accountingPlTdLabelCn} font-semibold`}>
                  <span className="inline-flex items-center gap-1.5">
                    {expandSales ? (
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                    )}
                    {t("pL_sales")}
                  </span>
                </td>
                <td className={`${accountingPlTdAmountCn} font-semibold`}>{formatBath(view.sales)}</td>
                <td className={`${accountingPlTdPctCn} font-medium`}>100.0%</td>
              </tr>
              {expandSales &&
                incomeStatementSalesBreakdown(data).map((row) => (
                  <tr key={row.key} className={accountingPlSubRowCn}>
                    <td className={accountingPlSubTdLabelCn}>
                      {salesBreakdownRowLabel(row, t, salesBreakdownIsDaily(data))}
                    </td>
                    <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                      {formatBath(
                        lineDisplayAmount(
                          row,
                          vatMode,
                          salesBreakdownIsHqOutbound(data)
                            ? data.displayAmounts?.salesStockVatBuckets
                            : null,
                          data.displayAmounts
                        )
                      )}
                    </td>
                    <td className={`${accountingPlTdPctCn}`}>
                      {view.pct(
                        lineDisplayAmount(
                          row,
                          vatMode,
                          salesBreakdownIsHqOutbound(data)
                            ? data.displayAmounts?.salesStockVatBuckets
                            : null,
                          data.displayAmounts
                        )
                      )}
                    </td>
                  </tr>
                ))}
            </>
          ) : (
            <tr className={accountingPlSalesRowCn}>
              <td className={`${accountingPlTdLabelCn} font-semibold`}>{t("pL_sales")}</td>
              <td className={`${accountingPlTdAmountCn} font-semibold`}>{formatBath(view.sales)}</td>
              <td className={`${accountingPlTdPctCn} font-medium`}>100.0%</td>
            </tr>
          )}
          <tr className={accountingPlInventoryRowCn}>
            <td className={cn(accountingPlTdLabelCn, accountingPlIndentLabelCn, "text-muted-foreground")}>
              + {t("pL_beginningInv")}
            </td>
            <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
              {formatBath(view.beginningInventory)}
            </td>
            <td className={accountingPlTdPctCn}>{view.pct(view.beginningInventory)}</td>
          </tr>
          <tr
            className={`${accountingPlInventoryRowCn} cursor-pointer select-none`}
            onClick={onTogglePurchases}
            title={t("pL_clickToExpand") || ""}
          >
            <td className={cn(accountingPlTdLabelCn, accountingPlIndentLabelCn, "text-muted-foreground")}>
              <span className="inline-flex items-center gap-1.5">
                {expandPurchases ? (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                )}
                + {t("pL_purchases")}
              </span>
            </td>
            <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>{formatBath(view.purchases)}</td>
            <td className={accountingPlTdPctCn}>{view.pct(view.purchases)}</td>
          </tr>
          {expandPurchases &&
            (data.purchaseByVendor?.length || 0) > 0 &&
            data.purchaseByVendor!.map((row) => (
              <tr
                key={row.key}
                className={
                  purchaseDrillContext?.yearMonth
                    ? `${accountingPlSubRowCn} cursor-pointer hover:brightness-[1.03]`
                    : accountingPlSubRowCn
                }
                onClick={purchaseDrillContext?.yearMonth ? () => openPurchaseDrill(row) : undefined}
                title={
                  purchaseDrillContext?.yearMonth ? t("pL_purchaseDrillClickHint") : undefined
                }
              >
                <td className={accountingPlSubTdLabelCn}>{purchaseVendorRowLabel(row, t)}</td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(
                    lineDisplayAmount(row, vatMode, data.displayAmounts?.purchasesStockVatBuckets)
                  )}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(
                    lineDisplayAmount(row, vatMode, data.displayAmounts?.purchasesStockVatBuckets)
                  )}
                </td>
              </tr>
            ))}
          {expandPurchases && !(data.purchaseByVendor?.length || 0) && (
            <tr className={accountingPlSubRowCn}>
              <td colSpan={3} className={cn(accountingPlSubTdLabelCn, "py-3 max-sm:basis-full")}>
                {t("inNoData") || "No data found."}
              </td>
            </tr>
          )}
          <tr className={accountingPlInventoryRowCn}>
            <td className={cn(accountingPlTdLabelCn, accountingPlIndentLabelCn, "text-muted-foreground")}>
              - {t("pL_endingInv")}
            </td>
            <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
              {formatBath(view.endingInventory)}
            </td>
            <td className={accountingPlTdPctCn}>{view.pct(-view.endingInventory)}</td>
          </tr>
          <tr className={accountingPlCogsRowCn}>
            <td className={`${accountingPlTdLabelCn} font-medium text-muted-foreground`}>= {t("pL_cogs")}</td>
            <td className={`${accountingPlTdAmountCn} font-medium text-muted-foreground`}>{formatBath(view.cogs)}</td>
            <td className={`${accountingPlTdPctCn} font-medium`}>{view.pct(view.cogs)}</td>
          </tr>
          <tr className={accountingPlGrossProfitRowCn}>
            <td className={`${accountingPlTdLabelCn} font-semibold text-primary`}>{t("pL_grossProfit")}</td>
            <td className={`${accountingPlTdAmountCn} font-semibold text-primary`}>
              {formatBath(view.grossProfit)}
            </td>
            <td className={`${accountingPlTdPctCn} font-semibold text-primary`}>{view.pct(view.grossProfit)}</td>
          </tr>
          <tr
            className={`${accountingPlExpenseRowCn} cursor-pointer select-none`}
            onClick={onToggleExpenseAccounts}
            title={t("pL_clickToExpand") || ""}
          >
            <td className={`${accountingPlTdLabelCn} font-medium text-muted-foreground`}>
              <span className="inline-flex items-center gap-1.5">
                {expandExpenseAccounts ? (
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                )}
                - {t("pL_expenses")}
              </span>
            </td>
            <td className={`${accountingPlTdAmountCn} font-medium text-muted-foreground`}>{formatBath(data.expenses)}</td>
            <td className={`${accountingPlTdPctCn} font-medium`}>{view.pct(data.expenses)}</td>
          </tr>
          {expandExpenseAccounts &&
            (data.expenseByAccountSubject?.length || 0) > 0 &&
            data.expenseByAccountSubject!.map((row, idx) => (
              <tr
                key={`${row.accountSubjectId ?? "u"}-${idx}`}
                className={
                  purchaseDrillContext?.yearMonth
                    ? `${accountingPlSubRowCn} cursor-pointer hover:brightness-[1.03]`
                    : accountingPlSubRowCn
                }
                onClick={purchaseDrillContext?.yearMonth ? () => openExpenseDrill(row) : undefined}
                title={purchaseDrillContext?.yearMonth ? t("pL_expenseDrillClickHint") : undefined}
              >
                <td className={accountingPlSubTdLabelCn}>
                  {row.accountSubjectId == null
                    ? t("pL_accountUnclassified") || "Unclassified account"
                    : formatAccountSubjectLabel(lang, {
                        code: row.code,
                        name: row.name,
                        nameEn: row.nameEn,
                        nameTh: row.nameTh,
                      }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(row.amount)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>{view.pct(row.amount)}</td>
              </tr>
            ))}
          {expandExpenseAccounts && !(data.expenseByAccountSubject?.length || 0) && (
            <tr className={accountingPlSubRowCn}>
              <td colSpan={3} className={cn(accountingPlSubTdLabelCn, "py-3 max-sm:basis-full")}>
                {t("inNoData") || "No data found."}
              </td>
            </tr>
          )}
          {showExpenseDetails && (
            <>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourcePetty") || "Petty Cash"}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.pettyCash ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.pettyCash ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceBank") || "Bank Withdrawal"}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.bankWithdraw ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.bankWithdraw ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceDeliveryApps")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.deliveryAppFees ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.deliveryAppFees ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceCardFees")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.cardFees ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.cardFees ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceFixed") || "Fixed Cost"}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.fixedExpenses ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.fixedExpenses ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceStockInbound") || "Inbound expense items"}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.stockInboundExpense ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.stockInboundExpense ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourcePayroll") || "Payroll"}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.payrollExpense ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.payrollExpense ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceDepreciation") || "Depreciation"}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(data.expenseBreakdown?.depreciationExpense ?? 0)}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(data.expenseBreakdown?.depreciationExpense ?? 0)}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceFranchiseRoyalty")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseRoyaltyGross ??
                        data.expenseBreakdown?.franchiseRoyalty,
                      data.displayAmounts?.franchiseRoyaltyNet,
                      vatMode
                    )
                  )}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseRoyaltyGross ??
                        data.expenseBreakdown?.franchiseRoyalty,
                      data.displayAmounts?.franchiseRoyaltyNet,
                      vatMode
                    )
                  )}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceFranchiseDeliveryGp")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseDeliveryGpGross ??
                        data.expenseBreakdown?.franchiseDeliveryGp,
                      data.displayAmounts?.franchiseDeliveryGpNet,
                      vatMode
                    )
                  )}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseDeliveryGpGross ??
                        data.expenseBreakdown?.franchiseDeliveryGp,
                      data.displayAmounts?.franchiseDeliveryGpNet,
                      vatMode
                    )
                  )}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceFranchiseGrabGp")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseGrabGpGross ??
                        data.expenseBreakdown?.franchiseGrabGp,
                      data.displayAmounts?.franchiseGrabGpNet,
                      vatMode
                    )
                  )}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseGrabGpGross ??
                        data.expenseBreakdown?.franchiseGrabGp,
                      data.displayAmounts?.franchiseGrabGpNet,
                      vatMode
                    )
                  )}
                </td>
              </tr>
              <tr className={accountingPlSubRowCn}>
                <td className={cn(accountingPlSubTdLabelCn, accountingPlDeepIndentLabelCn)}>
                  - {t("pL_expenseSourceFranchiseBillingCombined")}
                </td>
                <td className={`${accountingPlTdAmountCn} text-muted-foreground`}>
                  {formatBath(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseBillingCombinedGross ??
                        data.expenseBreakdown?.franchiseBillingCombined,
                      data.displayAmounts?.franchiseBillingCombinedNet,
                      vatMode
                    )
                  )}
                </td>
                <td className={`${accountingPlTdPctCn}`}>
                  {view.pct(
                    pickFranchiseBillingVatAmount(
                      data.displayAmounts?.franchiseBillingCombinedGross ??
                        data.expenseBreakdown?.franchiseBillingCombined,
                      data.displayAmounts?.franchiseBillingCombinedNet,
                      vatMode
                    )
                  )}
                </td>
              </tr>
            </>
          )}
          <tr className={accountingPlNetProfitRowCn}>
            <td className={cn(accountingPlTdLabelCn, "py-3.5 font-bold max-sm:py-0")}>{t("pL_netProfit")}</td>
            <td
              className={cn(
                accountingPlTdAmountCn,
                "py-3.5 font-bold max-sm:py-0",
                view.netProfit >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {formatBath(view.netProfit)}
            </td>
            <td
              className={cn(
                accountingPlTdPctCn,
                "py-3.5 font-bold max-sm:py-0",
                view.netProfit >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {view.pct(view.netProfit)}
            </td>
          </tr>
          {showEbitda && view.ebitda != null && (
            <>
              {(data.ebitdaBridge?.depreciation ?? 0) > 0 && (
                <tr className={accountingPlSubRowCn}>
                  <td className={cn(accountingPlSubTdLabelCn, "max-sm:pl-0 sm:pl-8")}>
                    + {t("pL_ebitdaDepreciation")}
                  </td>
                  <td className={`${accountingPlTdAmountCn}`}>
                    {formatBath(data.ebitdaBridge!.depreciation)}
                  </td>
                  <td className={`${accountingPlTdPctCn}`}>
                    {view.pct(data.ebitdaBridge!.depreciation)}
                  </td>
                </tr>
              )}
              {(data.ebitdaBridge?.interest ?? 0) > 0 && (
                <tr className={accountingPlSubRowCn}>
                  <td className={cn(accountingPlSubTdLabelCn, "max-sm:pl-0 sm:pl-8")}>
                    + {t("pL_ebitdaInterest")}
                  </td>
                  <td className={`${accountingPlTdAmountCn}`}>
                    {formatBath(data.ebitdaBridge!.interest)}
                  </td>
                  <td className={`${accountingPlTdPctCn}`}>
                    {view.pct(data.ebitdaBridge!.interest)}
                  </td>
                </tr>
              )}
              {(data.ebitdaBridge?.incomeTax ?? 0) > 0 && (
                <tr className={accountingPlSubRowCn}>
                  <td className={cn(accountingPlSubTdLabelCn, "max-sm:pl-0 sm:pl-8")}>
                    + {t("pL_ebitdaIncomeTax")}
                  </td>
                  <td className={`${accountingPlTdAmountCn}`}>
                    {formatBath(data.ebitdaBridge!.incomeTax)}
                  </td>
                  <td className={`${accountingPlTdPctCn}`}>
                    {view.pct(data.ebitdaBridge!.incomeTax)}
                  </td>
                </tr>
              )}
              <tr className={accountingPlGrossProfitRowCn}>
                <td className={`${accountingPlTdLabelCn} font-semibold`}>= {t("pL_ebitda")}</td>
                <td
                  className={`${accountingPlTdAmountCn} font-semibold ${
                    view.ebitda >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {formatBath(view.ebitda)}
                </td>
                <td
                  className={`${accountingPlTdPctCn} font-semibold ${
                    view.ebitda >= 0 ? "text-primary" : "text-destructive"
                  }`}
                >
                  {view.pct(view.ebitda)}
                </td>
              </tr>
              <tr className={cn(accountingPlSubRowCn, "max-sm:!block")}>
                <td
                  colSpan={3}
                  className="px-3 pb-3 text-[11px] text-muted-foreground leading-relaxed max-sm:basis-full max-sm:px-0 max-sm:pb-1"
                >
                  {t("pL_ebitdaNote")}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      </div>

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
