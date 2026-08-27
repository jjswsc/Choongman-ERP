"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useRouter } from "next/navigation"
import { appAlert, appPrompt } from "@/lib/app-message"
import {
  approveExpenseAccrual,
  executeExpensePayment,
  getApprovedExpenseAccrualsForBankTx,
  linkReceivableFromBankTransaction,
  addReceivableStoreCredit,
  invalidateReceivablePayableListCache,
  type ExpenseAccrualPlanItem,
  type OpenReceivableForBankItem,
  type LinkedReceivableForBankItem,
  type LinkedReceivableForBankSummary,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import { ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import {
  bankNoteUserDisplayText,
} from "@/lib/bank-transaction-note-meta"
import {
  BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE,
} from "@/lib/bank-expense-via-expense-mgmt"
import {
  formatMoneyAmountParam,
  formatMoneyBaht,
  moneyEqual,
  parseMoneyAmount,
} from "@/lib/money-amount"
import {
  defaultExpenseBankComboPeriod,
  expensePlanPickTotalMatchesBank,
  isExpenseBankComboPeriodReady,
  isExpenseBankComboSearchReady,
  sumExpensePlanPickAmount,
} from "@/lib/expense-accrual-bank-multi-link"
import {
  canSaveReceivablePickWithMismatch,
  roundReceivableMoney,
  sumOpenReceivablePickAmount,
} from "@/lib/bank-receivable-link"
import {
  RECEIVABLE_BANK_LINK_MISMATCH_REASONS,
  classifyReceivableBankLinkMismatch,
  computeReceivableLinkGap,
} from "@/lib/bank-receivable-link-policy"
import type { BankTransactionRow } from "./bank-transactions-tab-utils"

export interface BankRegisterActionDialogProps {
  registerActionRow: BankTransactionRow | null
  setRegisterActionRow: (row: BankTransactionRow | null) => void
  openApprovedPick: (row: BankTransactionRow) => void

  approvedPickRow: BankTransactionRow | null
  setApprovedPickRow: (row: BankTransactionRow | null) => void
  approvedPickList: ExpenseAccrualPlanItem[]
  setApprovedPickList: (list: ExpenseAccrualPlanItem[]) => void
  approvedPickIds: number[]
  setApprovedPickIds: React.Dispatch<React.SetStateAction<number[]>>
  approvedPickLoading: boolean
  approvedPickSaving: boolean
  setApprovedPickSaving: (v: boolean) => void

  receivableLinkedRow: BankTransactionRow | null
  setReceivableLinkedRow: (row: BankTransactionRow | null) => void
  receivableLinkedList: LinkedReceivableForBankItem[]
  setReceivableLinkedList: (list: LinkedReceivableForBankItem[]) => void
  receivableLinkedSummary: LinkedReceivableForBankSummary | null
  setReceivableLinkedSummary: (s: LinkedReceivableForBankSummary | null) => void
  receivableLinkedLoading: boolean
  receivableLinkedUnlinking: boolean
  beginReceivableLinkEdit: () => void

  receivablePickRow: BankTransactionRow | null
  setReceivablePickRow: (row: BankTransactionRow | null) => void
  receivablePickList: OpenReceivableForBankItem[]
  setReceivablePickList: (list: OpenReceivableForBankItem[]) => void
  receivablePickSelectedIds: number[]
  setReceivablePickSelectedIds: React.Dispatch<React.SetStateAction<number[]>>
  receivablePickLoading: boolean
  receivablePickSaving: boolean
  setReceivablePickSaving: (v: boolean) => void
  receivablePickStoreCreditAvailable: number
  setReceivablePickStoreCreditAvailable: React.Dispatch<React.SetStateAction<number>>
  receivablePickCreditApply: number
  setReceivablePickCreditApply: (v: number) => void
  receivablePickMismatchReason: string
  setReceivablePickMismatchReason: (v: string) => void
  receivablePickMismatchNote: string
  setReceivablePickMismatchNote: (v: string) => void

  accountId: string
  selectedAccountStore: string
  startStr: string
  endStr: string
  auth: { user?: string; role?: string; store?: string; canManageOfficePayroll?: boolean } | null
  canApproveReceivableMismatch: boolean
  loadData: () => void

  t: (key: string) => string
  tt: (key: string, fallback: string) => string
}

export function BankRegisterActionDialog(props: BankRegisterActionDialogProps) {
  const {
    registerActionRow, setRegisterActionRow, openApprovedPick,
    approvedPickRow, setApprovedPickRow, approvedPickList, setApprovedPickList,
    approvedPickIds, setApprovedPickIds, approvedPickLoading,
    approvedPickSaving, setApprovedPickSaving,
    receivableLinkedRow, setReceivableLinkedRow,
    receivableLinkedList, setReceivableLinkedList,
    receivableLinkedSummary, setReceivableLinkedSummary,
    receivableLinkedLoading, receivableLinkedUnlinking, beginReceivableLinkEdit,
    receivablePickRow, setReceivablePickRow,
    receivablePickList, setReceivablePickList,
    receivablePickSelectedIds, setReceivablePickSelectedIds,
    receivablePickLoading, receivablePickSaving, setReceivablePickSaving,
    receivablePickStoreCreditAvailable, setReceivablePickStoreCreditAvailable,
    receivablePickCreditApply, setReceivablePickCreditApply,
    receivablePickMismatchReason, setReceivablePickMismatchReason,
    receivablePickMismatchNote, setReceivablePickMismatchNote,
    accountId, selectedAccountStore, startStr, endStr,
    auth, canApproveReceivableMismatch, loadData,
    t, tt,
  } = props

  const router = useRouter()
  const [comboOpen, setComboOpen] = React.useState(false)
  const [comboQuery, setComboQuery] = React.useState("")
  const [comboFrom, setComboFrom] = React.useState("")
  const [comboTo, setComboTo] = React.useState("")
  const [comboSearching, setComboSearching] = React.useState(false)
  const [comboSearched, setComboSearched] = React.useState(false)

  const applyDefaultComboPeriod = React.useCallback((bankDate?: string) => {
    const d = defaultExpenseBankComboPeriod(bankDate || "")
    setComboFrom(d.from)
    setComboTo(d.to)
  }, [])

  React.useEffect(() => {
    if (approvedPickRow) return
    setComboOpen(false)
    setComboQuery("")
    setComboFrom("")
    setComboTo("")
    setComboSearching(false)
    setComboSearched(false)
  }, [approvedPickRow])

  React.useEffect(() => {
    if (!approvedPickRow || approvedPickLoading) return
    if (approvedPickList.length === 0 && !comboSearched) {
      setComboOpen(true)
      applyDefaultComboPeriod(approvedPickRow.transDate)
    }
  }, [approvedPickRow, approvedPickLoading, approvedPickList.length, applyDefaultComboPeriod, comboSearched])

  const runComboSearch = React.useCallback(async () => {
    if (!approvedPickRow?.id) return
    if (!isExpenseBankComboPeriodReady(comboFrom, comboTo)) {
      await appAlert(tt("bankExpensePickComboNeedPeriod", "검색 기간(시작·종료일)을 넣고, 93일 이내로 해 주세요."))
      return
    }
    if (!isExpenseBankComboSearchReady(comboQuery, { from: comboFrom, to: comboTo })) {
      await appAlert(tt("bankExpensePickComboNeedQuery", "기간을 입력해 주세요. 거래처·문서번호·한쪽 금액은 선택입니다."))
      return
    }
    setComboSearching(true)
    try {
      const res = await getApprovedExpenseAccrualsForBankTx({
        bankTransactionId: Number(approvedPickRow.id),
        userRole: auth?.role,
        storeFilter: (approvedPickRow.storeName || "").trim() || selectedAccountStore || undefined,
        combo: true,
        q: comboQuery.trim(),
        from: comboFrom,
        to: comboTo,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
        return
      }
      const hits = res.list || []
      const byId = new Map(approvedPickList.map((row) => [row.id, row]))
      for (const h of hits) byId.set(h.id, h)
      setApprovedPickList([...byId.values()])
      setComboSearched(true)
    } finally {
      setComboSearching(false)
    }
  }, [approvedPickList, approvedPickRow, auth?.role, comboFrom, comboQuery, comboTo, selectedAccountStore, setApprovedPickList, t, tt])

  return (
    <>
      {/* Register Action (expense management link) */}
      <Dialog open={!!registerActionRow} onOpenChange={(open) => !open && setRegisterActionRow(null)}>
        <DialogContent className={`max-w-md ${ADMIN_DIALOG_SCROLL_CN}`}>
          <DialogHeader>
            <DialogTitle>{tt("bankRegisterLinkExpenseMgmt", "지출관리 연결")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {registerActionRow ? `${registerActionRow.transDate} · ฿${Math.abs(registerActionRow.amount || 0).toLocaleString()}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {tt("bankExpenseViaExpenseMgmt", BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE)}
          </p>
          <div className="grid grid-cols-1 gap-2 pt-2">
            <Button
              type="button"
              onClick={() => {
                if (!registerActionRow) return
                setRegisterActionRow(null)
                openApprovedPick(registerActionRow)
              }}
            >
              {tt("expensePlanTab", "지급예정")} {tt("btnSelect", "선택")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!registerActionRow) return
                const r = registerActionRow
                const amt = Math.abs(r.amount ?? 0)
                const bankMemo = (r.memo || "").trim().slice(0, 500)
                const bankNote = bankNoteUserDisplayText((r.note || "").trim()).slice(0, 500)
                const q = new URLSearchParams({ tab: "expenseRegister" })
                if (r.id) q.set("bankTransactionId", String(r.id))
                if (amt > 0) q.set("amount", formatMoneyAmountParam(amt))
                if (bankMemo) q.set("bankMemo", bankMemo)
                if (bankNote) q.set("bankNote", bankNote)
                if (r.transDate) q.set("transDate", r.transDate)
                if (accountId) q.set("accountId", accountId)
                if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                if (r.category) q.set("category", r.category)
                q.set("startStr", startStr)
                q.set("endStr", endStr)
                q.set("returnTab", "query")
                if (r.id) q.set("openRegisterTxId", String(r.id))
                setRegisterActionRow(null)
                router.push(`/admin/expense-management?${q.toString()}`)
              }}
            >
              {t("bankRegisterLink") || "신규 지출 등록"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approved Expense Pick */}
      <Dialog
        open={!!approvedPickRow}
        onOpenChange={(open) => {
          if (!open) {
            setApprovedPickRow(null)
            setApprovedPickList([])
            setApprovedPickIds([])
          }
        }}
      >
        <DialogContent className="left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-hidden rounded-none border-0 p-4 sm:p-6">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>{tt("expensePlanTab", "지급예정")} {tt("btnSelect", "선택")}</DialogTitle>
          </DialogHeader>
          <p className="mb-0 shrink-0 text-sm text-muted-foreground">
            {approvedPickRow ? `${approvedPickRow.transDate} · ฿${formatMoneyBaht(Math.abs(approvedPickRow.amount || 0))}` : ""}
          </p>
          {approvedPickLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading") || "로딩..."}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <p className="text-xs text-muted-foreground leading-snug">
                {tt(
                  "bankExpensePickExactHint",
                  "금액이 같은 지급예정만 먼저 보여 줍니다. 영수증을 2건으로 나눈 경우에는 「두 건 합산 검색」에서 기간으로 찾으세요."
                )}
              </p>
              {approvedPickList.length === 0 ? (
                <p className="min-h-0 flex-1 py-2 text-sm text-muted-foreground">
                  {comboSearched
                    ? tt("bankExpensePickComboEmpty", "검색 결과가 없습니다. 거래처명·문서번호·한쪽 금액을 바꿔 보세요.")
                    : tt("expensePlanPickEmptyForBankLink", "No linkable payment plan for this date/store.")}
                </p>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {approvedPickList.map((p) => {
                    const checked = approvedPickIds.includes(p.id)
                    const tag =
                      p.payeeMemoMatchQuality === "mismatch"
                        ? "⚠"
                        : p.payeeMemoMatchQuality === "uncertain"
                          ? "?"
                          : p.payeeMemoMatchQuality === "ok"
                            ? "✓"
                            : "·"
                    const statusTag =
                      p.status === "planned"
                        ? tt("expensePlanStatusPlanned", "대기")
                        : p.status === "partial"
                          ? tt("expensePlanStatusPartial", "부분")
                          : ""
                    return (
                      <label
                        key={p.id}
                        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={checked}
                          className="mt-0.5"
                          onCheckedChange={(v) => {
                            setApprovedPickIds((prev) => {
                              if (v) return prev.includes(p.id) ? prev : [...prev, p.id]
                              return prev.filter((id) => id !== p.id)
                            })
                          }}
                        />
                        <span className="flex-1 min-w-0 text-sm leading-snug">
                          <span className="font-medium">
                            {tag}{statusTag ? ` [${statusTag}]` : ""} {(p.dueDate || p.expenseDate || "-")} · {p.payeeName}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {p.documentNo ? `${p.documentNo} · ` : ""}
                            {p.payeeCode || "-"}
                            {p.amountMatch === false ? " ≠" : ""}
                          </span>
                        </span>
                        <span className="text-sm font-medium tabular-nums whitespace-nowrap shrink-0">
                          ฿{formatMoneyBaht(p.remainingAmount || 0)}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
              {comboOpen ? (
                <div className="shrink-0 space-y-2 rounded-md border border-border p-2">
                  <p className="text-xs text-muted-foreground leading-snug">
                    {tt(
                      "bankExpensePickComboHint",
                      "기간이 기본입니다. 출금일이 속한 달이 미리 들어가 있으니, 필요하면 날짜를 바꾼 뒤 검색하세요. 거래처·문서번호·한쪽 금액은 더 좁힐 때만 넣습니다."
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {tt("bankExpensePickComboFrom", "시작일")}
                      </span>
                      <Input
                        type="date"
                        value={comboFrom}
                        onChange={(e) => setComboFrom(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </label>
                    <label className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {tt("bankExpensePickComboTo", "종료일")}
                      </span>
                      <Input
                        type="date"
                        value={comboTo}
                        onChange={(e) => setComboTo(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={comboQuery}
                      onChange={(e) => setComboQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return
                        e.preventDefault()
                        void runComboSearch()
                      }}
                      placeholder={tt("bankExpensePickComboPlaceholder", "거래처 / EXP번호 / 6,000 (선택)")}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 shrink-0"
                      disabled={comboSearching}
                      onClick={() => void runComboSearch()}
                    >
                      {comboSearching ? "..." : (t("search") || "검색")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-full shrink-0 text-xs"
                  onClick={() => {
                    applyDefaultComboPeriod(approvedPickRow?.transDate)
                    setComboOpen(true)
                  }}
                >
                  {tt("bankExpensePickComboOpen", "두 건 합산 검색")}
                </Button>
              )}
              {(() => {
                const selected = approvedPickList.filter((x) => approvedPickIds.includes(x.id))
                const mismatch = selected.find((x) => x.payeeMemoMatchQuality === "mismatch")
                const uncertain = selected.find((x) => x.payeeMemoMatchQuality === "uncertain")
                if (mismatch) {
                  return (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {tt("bankPayeeMemoMismatchOverride", "적요와 지급처가 불일치로 추정됩니다. 금액이 일치하면 저장할 수 있습니다.")}
                      {mismatch.payeeMemoMatchDetail ? ` — ${mismatch.payeeMemoMatchDetail}` : ""}
                    </p>
                  )
                }
                if (uncertain) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      {tt("bankPayeeMemoUncertain", "적요와 지급처 일치를 확정할 수 없습니다. 내용을 확인하세요.")}
                      {uncertain.payeeMemoMatchDetail ? ` — ${uncertain.payeeMemoMatchDetail}` : ""}
                    </p>
                  )
                }
                return null
              })()}
              {(() => {
                const bankAmt = parseMoneyAmount(approvedPickRow?.amount || 0)
                const selectedTotal = sumExpensePlanPickAmount(approvedPickList, approvedPickIds)
                const matches = expensePlanPickTotalMatchesBank(bankAmt, selectedTotal)
                return (
                  <div
                    className={cn(
                      "shrink-0 rounded-md border px-3 py-2 text-sm space-y-1",
                      approvedPickIds.length === 0
                        ? "border-border bg-muted/30"
                        : matches
                          ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                          : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                    )}
                  >
                    <div className="flex justify-between gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {tt("bankExpensePickBankAmount", "통장 출금")}
                      </span>
                      <span className="font-medium">฿{formatMoneyBaht(bankAmt)}</span>
                    </div>
                    <div className="flex justify-between gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {tt("bankExpensePickSelectedTotal", "선택 합계")} ({approvedPickIds.length})
                      </span>
                      <span className="font-medium">฿{formatMoneyBaht(selectedTotal)}</span>
                    </div>
                    {approvedPickIds.length > 0 && matches ? (
                      <p className="text-xs text-green-800 dark:text-green-300">
                        {tt("bankExpensePickAmountOk", "금액이 일치합니다.")}
                      </p>
                    ) : approvedPickIds.length > 0 ? (
                      <p className="text-xs text-destructive">
                        {tt("bankPlanAmountMismatchDetail", "Bank amount differs from plan balance.")
                          .replace("{bankAmount}", formatMoneyBaht(bankAmt))
                          .replace("{remain}", formatMoneyBaht(selectedTotal))}
                      </p>
                    ) : null}
                  </div>
                )
              })()}
              {approvedPickList.some((x) => approvedPickIds.includes(x.id) && x.status === "planned") ? (
                <p className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                  {tt(
                    "expensePlanPickPlannedNeedsApproval",
                    "Selected item is pending approval. Saving will auto-approve; HQ items need Director/Secretary rights."
                  )}
                </p>
              ) : null}
              <div className="flex shrink-0 justify-end gap-2">
                <Button variant="outline" onClick={() => setApprovedPickRow(null)}>
                  {t("cancel") || "취소"}
                </Button>
                <Button
                  onClick={async () => {
                    if (!approvedPickRow?.id || approvedPickIds.length === 0) return
                    const selected = approvedPickList.filter((x) => approvedPickIds.includes(x.id))
                    const bankAmt = parseMoneyAmount(approvedPickRow.amount || 0)
                    const selectedTotal = sumExpensePlanPickAmount(approvedPickList, approvedPickIds)
                    if (!expensePlanPickTotalMatchesBank(bankAmt, selectedTotal)) {
                      await appAlert(tt("bankPlanAmountMismatch", "통장 금액과 선택한 지급예정 잔액이 일치해야 합니다."))
                      return
                    }
                    setApprovedPickSaving(true)
                    try {
                      for (const item of selected) {
                        if (item.status !== "planned") continue
                        const approveRes = await approveExpenseAccrual({
                          expenseAccrualId: item.id,
                          action: "approve",
                          userName: auth?.user,
                          userRole: auth?.role,
                        })
                        if (!approveRes.success) {
                          await appAlert(translateApiMessage(approveRes.message, t) || approveRes.message || t("processFail"))
                          return
                        }
                      }
                      const res = await executeExpensePayment({
                        expenseAccrualId: approvedPickIds[0],
                        expenseAccrualIds: approvedPickIds,
                        paymentMethod: "bank",
                        amount: bankAmt,
                        transDate: String(approvedPickRow.transDate || "").slice(0, 10),
                        memo: bankNoteUserDisplayText(
                          (approvedPickRow.note || approvedPickRow.memo || "").trim()
                        ),
                        bankTransactionId: Number(approvedPickRow.id),
                        userName: auth?.user,
                        userRole: auth?.role,
                      })
                      if (!res.success) {
                        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
                        return
                      }
                      setApprovedPickRow(null)
                      setApprovedPickList([])
                      setApprovedPickIds([])
                      loadData()
                    } finally {
                      setApprovedPickSaving(false)
                    }
                  }}
                  disabled={
                    approvedPickIds.length === 0 ||
                    approvedPickSaving ||
                    !expensePlanPickTotalMatchesBank(
                      parseMoneyAmount(approvedPickRow?.amount || 0),
                      sumExpensePlanPickAmount(approvedPickList, approvedPickIds)
                    )
                  }
                >
                  {approvedPickSaving ? "..." : (t("btnSave") || "저장")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receivable Linked View */}
      <Dialog
        open={!!receivableLinkedRow}
        onOpenChange={(open) => {
          if (!open) {
            setReceivableLinkedRow(null)
            setReceivableLinkedList([])
            setReceivableLinkedSummary(null)
          }
        }}
      >
        <DialogContent className={`max-w-lg ${ADMIN_DIALOG_SCROLL_CN}`}>
          <DialogHeader>
            <DialogTitle>{tt("bankReceivableLinkedTitle", "미수 연결 내역")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            {receivableLinkedRow
              ? `${receivableLinkedRow.transDate} · ฿${Math.abs(receivableLinkedRow.amount || 0).toLocaleString()}`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground mb-3 leading-snug">
            {tt(
              "bankReceivableLinkedHint",
              "이 통장 입금에 연결된 인보이스입니다. 잘못 연결했으면 「연결 수정」으로 해제 후 다시 연결하세요."
            )}
          </p>
          {receivableLinkedLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading") || "로딩..."}</p>
          ) : receivableLinkedList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {tt("bankReceivableLinkedEmpty", "연결된 미수금이 없습니다.")}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[min(50vh,320px)] overflow-y-auto rounded-md border border-border divide-y divide-border">
                {receivableLinkedList.map((p) => {
                  const label =
                    p.invoiceNo ||
                    (p.refId ? `#${p.refId}` : "") ||
                    (p.memo ? p.memo.slice(0, 40) : "")
                  return (
                    <div key={p.accrualId} className="px-3 py-2 text-sm leading-snug">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex-1 min-w-0">
                          <span className="font-medium tabular-nums">{p.transDate}</span>
                          <span className="text-muted-foreground"> · {p.refType}</span>
                          {label ? (
                            <span className="block text-xs text-muted-foreground truncate">{label}</span>
                          ) : null}
                        </span>
                        <span className="font-medium tabular-nums whitespace-nowrap shrink-0">
                          ฿{p.paidTotal.toLocaleString()}
                        </span>
                      </div>
                      {(p.paidFromCredit > 0.009 || p.paidFromRounding > 0.009) && (
                        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                          {p.paidFromBank > 0.009
                            ? `${tt("bankReceivableLinkedPaidFromBank", "통장")} ฿${p.paidFromBank.toLocaleString()}`
                            : ""}
                          {p.paidFromCredit > 0.009
                            ? `${p.paidFromBank > 0.009 ? " · " : ""}${tt("bankReceivableLinkedPaidFromCredit", "선수금")} ฿${p.paidFromCredit.toLocaleString()}`
                            : ""}
                          {p.paidFromRounding > 0.009
                            ? `${p.paidFromBank > 0.009 || p.paidFromCredit > 0.009 ? " · " : ""}${tt("bankReceivableLinkedPaidFromRounding", "차액")} ฿${p.paidFromRounding.toLocaleString()}`
                            : ""}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              {receivableLinkedSummary ? (
                <div className="rounded-md border border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-muted-foreground">
                      {tt("bankReceivablePickBankAmount", "통장 입금")}
                    </span>
                    <span className="font-medium">
                      ฿{receivableLinkedSummary.bankAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-muted-foreground">
                      {tt("bankReceivablePickSelectedTotal", "연결 합계")} ({receivableLinkedList.length})
                    </span>
                    <span className="font-medium">
                      ฿{receivableLinkedSummary.linkedTotal.toLocaleString()}
                    </span>
                  </div>
                  {receivableLinkedSummary.storeCreditApplied > 0.009 ? (
                    <div className="flex justify-between gap-2 tabular-nums text-xs">
                      <span className="text-muted-foreground">
                        {tt("bankReceivableLinkedStoreCreditApplied", "선수금 사용")}
                      </span>
                      <span>
                        ฿{receivableLinkedSummary.storeCreditApplied.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReceivableLinkedRow(null)}>
                  {t("cancel") || "취소"}
                </Button>
                <Button
                  onClick={() => void beginReceivableLinkEdit()}
                  disabled={receivableLinkedUnlinking}
                >
                  {receivableLinkedUnlinking
                    ? "..."
                    : tt("bankReceivableLinkedEdit", "연결 수정")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receivable Pick */}
      <Dialog
        open={!!receivablePickRow}
        onOpenChange={(open) => {
          if (!open) {
            setReceivablePickRow(null)
            setReceivablePickList([])
            setReceivablePickSelectedIds([])
            setReceivablePickCreditApply(0)
            setReceivablePickMismatchReason("")
            setReceivablePickMismatchNote("")
            setReceivablePickStoreCreditAvailable(0)
          }
        }}
      >
        <DialogContent className={`max-w-lg ${ADMIN_DIALOG_SCROLL_CN}`}>
          <DialogHeader>
            <DialogTitle>{tt("bankRegisterLinkReceivable", "미수금 연결")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            {receivablePickRow
              ? `${receivablePickRow.transDate} · ฿${Math.abs(receivablePickRow.amount || 0).toLocaleString()}`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground mb-3 leading-snug">
            {tt(
              "bankReceivablePickWorkflowHint",
              "매출 수령으로 매장 잔액은 이미 반영되었습니다. 아래에서 이 입금에 해당하는 인보이스를 선택하면 미수금 화면 수금확인에 자동 반영됩니다."
            )}
          </p>
          {receivablePickLoading ? (
            <p className="text-sm text-muted-foreground py-4">{t("loading") || "로딩..."}</p>
          ) : receivablePickList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {tt("bankReceivablePickEmpty", "연결 가능한 미수금(출고·주문)이 없습니다.")}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {tt(
                  "bankReceivablePickMultiHint",
                  "여러 인보이스를 선택할 수 있습니다. 선택 합계가 통장 입금액과 일치해야 저장됩니다."
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {tt("bankReceivablePickListHint", "인보이스별 미수 잔액이 남은 건만 표시됩니다(장부 기준).")}
              </p>
              <div className="max-h-[min(50vh,320px)] overflow-y-auto rounded-md border border-border divide-y divide-border">
                {receivablePickList.map((p) => {
                  const checked = receivablePickSelectedIds.includes(p.id)
                  const label =
                    p.invoiceNo ||
                    (p.refId ? `#${p.refId}` : "") ||
                    (p.memo ? p.memo.slice(0, 40) : "")
                  return (
                    <label
                      key={p.id}
                      className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        className="mt-0.5"
                        onCheckedChange={(v) => {
                          setReceivablePickSelectedIds((prev) => {
                            if (v) return prev.includes(p.id) ? prev : [...prev, p.id]
                            return prev.filter((id) => id !== p.id)
                          })
                        }}
                      />
                      <span className="flex-1 min-w-0 text-sm leading-snug">
                        <span className="font-medium tabular-nums">{p.transDate}</span>
                        <span className="text-muted-foreground"> · {p.refType}</span>
                        {label ? (
                          <span className="block text-xs text-muted-foreground truncate">{label}</span>
                        ) : null}
                      </span>
                      <span className="text-sm font-medium tabular-nums whitespace-nowrap shrink-0">
                        ฿{p.remainingAmount.toLocaleString()}
                      </span>
                    </label>
                  )
                })}
              </div>
              {(() => {
                const bankAmt = Math.abs(Number(receivablePickRow?.amount || 0))
                const selectedTotal = sumOpenReceivablePickAmount(
                  receivablePickList,
                  receivablePickSelectedIds
                )
                const creditApply = roundReceivableMoney(Math.max(0, receivablePickCreditApply))
                const gap = computeReceivableLinkGap(bankAmt, selectedTotal, creditApply)
                const matches = Math.abs(gap) <= 0.01
                const { kind } = classifyReceivableBankLinkMismatch(bankAmt, selectedTotal, creditApply)
                const canSave =
                  receivablePickSelectedIds.length > 0 &&
                  canSaveReceivablePickWithMismatch({
                    bankAmt,
                    selectedTotal,
                    storeCreditApply: creditApply,
                    mismatchNote: receivablePickMismatchNote,
                    mismatchReason: receivablePickMismatchReason,
                    canApproveMismatch: canApproveReceivableMismatch,
                  })
                const showMismatchFields = receivablePickSelectedIds.length > 0 && !matches
                const shortfall = Math.max(0, gap)
                return (
                  <>
                    <div
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm space-y-1",
                        receivablePickSelectedIds.length === 0
                          ? "border-border bg-muted/30"
                          : matches
                            ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                            : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                      )}
                    >
                      <div className="flex justify-between gap-2 tabular-nums">
                        <span className="text-muted-foreground">
                          {tt("bankReceivablePickBankAmount", "통장 입금")}
                        </span>
                        <span className="font-medium">฿{bankAmt.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-2 tabular-nums">
                        <span className="text-muted-foreground">
                          {tt("bankReceivablePickSelectedTotal", "선택 합계")} ({receivablePickSelectedIds.length})
                        </span>
                        <span className="font-medium">฿{selectedTotal.toLocaleString()}</span>
                      </div>
                      {creditApply > 0.009 ? (
                        <div className="flex justify-between gap-2 tabular-nums">
                          <span className="text-muted-foreground">
                            {tt("bankReceivablePickStoreCreditApply", "선수금 적용")}
                          </span>
                          <span className="font-medium">฿{creditApply.toLocaleString()}</span>
                        </div>
                      ) : null}
                      {showMismatchFields ? (
                        <p className="text-sm text-amber-800 dark:text-amber-200 tabular-nums">
                          {tt("bankReceivablePickDiff", "차이")}: ฿{gap.toLocaleString()}
                        </p>
                      ) : null}
                      {receivablePickSelectedIds.length > 0 && matches ? (
                        <p className="text-xs text-green-800 dark:text-green-300">
                          {tt("bankReceivablePickAmountOk", "금액이 일치합니다.")}
                        </p>
                      ) : null}
                      {showMismatchFields && kind === "large" && !canApproveReceivableMismatch ? (
                        <p className="text-xs text-destructive">
                          {tt(
                            "bankReceivablePickMismatchApprovalRequired",
                            "큰 차액 — Director 또는 오피스 급여 담당 승인 필요"
                          )}
                        </p>
                      ) : null}
                    </div>
                    {receivablePickStoreCreditAvailable > 0.009 ? (
                      <div className="rounded-md border border-border px-3 py-2 space-y-2 text-sm">
                        <div className="flex justify-between gap-2 tabular-nums">
                          <span className="text-muted-foreground">
                            {tt("bankReceivablePickStoreCreditAvailable", "매장 선수금 잔액")}
                          </span>
                          <span className="font-medium">
                            ฿{receivablePickStoreCreditAvailable.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-8 w-32 tabular-nums"
                            value={creditApply || ""}
                            onChange={(e) =>
                              setReceivablePickCreditApply(
                                roundReceivableMoney(Math.max(0, parseMoneyAmount(e.target.value)))
                              )
                            }
                          />
                          {shortfall > 0.009 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() =>
                                setReceivablePickCreditApply(
                                  roundReceivableMoney(
                                    Math.min(shortfall, receivablePickStoreCreditAvailable)
                                  )
                                )
                              }
                            >
                              {tt("bankReceivablePickStoreCreditApplyAll", "부족분 전액 적용")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {showMismatchFields ? (
                      <div className="space-y-2 rounded-md border border-border px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground leading-snug">
                          {tt(
                            "bankReceivablePickMismatchHint",
                            "금액이 다를 때는 사유를 선택하거나 หมายเหตุ를 입력하세요."
                          )}
                        </p>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            {tt("bankReceivablePickMismatchReason", "차액 사유")}
                          </label>
                          <Select
                            value={receivablePickMismatchReason || "__none__"}
                            onValueChange={(v) =>
                              setReceivablePickMismatchReason(v === "__none__" ? "" : v)
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {RECEIVABLE_BANK_LINK_MISMATCH_REASONS.map((reason) => (
                                <SelectItem key={reason} value={reason}>
                                  {tt(`bankReceivableMismatchReason_${reason}`, reason)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            {tt("bankReceivablePickMismatchNote", "หมายเหตุ")}
                          </label>
                          <Input
                            value={receivablePickMismatchNote}
                            onChange={(e) => setReceivablePickMismatchNote(e.target.value)}
                            placeholder={tt(
                              "bankReceivablePickMismatchNotePlaceholder",
                              "예: 3월 인보이스 오류 과납 273บ. 상계"
                            )}
                          />
                        </div>
                      </div>
                    ) : null}
                    {canApproveReceivableMismatch && receivablePickRow?.storeName ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const memo = await appPrompt(
                              tt("bankReceivablePickMismatchNote", "หมายเหตุ"),
                              ""
                            )
                            if (memo === null) return
                            const amountStr = await appPrompt(
                              tt("bankReceivablePickStoreCreditAvailable", "매장 선수금 잔액"),
                              shortfall > 0.009 ? String(shortfall) : ""
                            )
                            if (amountStr === null) return
                            const amount = parseMoneyAmount(amountStr)
                            if (amount <= 0) return
                            const res = await addReceivableStoreCredit({
                              storeName: String(receivablePickRow.storeName || ""),
                              amount,
                              transDate: String(receivablePickRow.transDate || "").slice(0, 10),
                              memo: memo.trim(),
                            })
                            if (!res.success) {
                              await appAlert(
                                translateApiMessage(res.message, t) || res.message || t("processFail")
                              )
                              return
                            }
                            setReceivablePickStoreCreditAvailable((prev) =>
                              roundReceivableMoney(prev + amount)
                            )
                            if (shortfall > 0.009) {
                              setReceivablePickCreditApply(
                                roundReceivableMoney(Math.min(shortfall, amount))
                              )
                            }
                          }}
                        >
                          {tt("bankReceivablePickRegisterStoreCredit", "선수금 등록")}
                        </Button>
                      </div>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setReceivablePickRow(null)}>
                        {t("cancel") || "취소"}
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!receivablePickRow?.id || receivablePickSelectedIds.length === 0) return
                          if (!canSave) {
                            await appAlert(
                              tt(
                                "bankReceivableAmountMismatch",
                                "통장 금액과 선택한 미수 잔액 합계가 일치해야 합니다."
                              )
                            )
                            return
                          }
                          setReceivablePickSaving(true)
                          try {
                            const res = await linkReceivableFromBankTransaction({
                              bankTransactionId: Number(receivablePickRow.id),
                              receivableAccrualIds: receivablePickSelectedIds,
                              storeCreditApplyAmount: creditApply > 0.009 ? creditApply : undefined,
                              mismatchNote: receivablePickMismatchNote.trim() || undefined,
                              mismatchReason: receivablePickMismatchReason || undefined,
                            })
                            if (!res.success) {
                              await appAlert(
                                translateApiMessage(res.message, t) || res.message || t("processFail")
                              )
                              return
                            }
                            setReceivablePickRow(null)
                            setReceivablePickList([])
                            setReceivablePickSelectedIds([])
                            setReceivablePickCreditApply(0)
                            setReceivablePickMismatchReason("")
                            setReceivablePickMismatchNote("")
                            await invalidateReceivablePayableListCache()
                            loadData()
                          } finally {
                            setReceivablePickSaving(false)
                          }
                        }}
                        disabled={
                          receivablePickSelectedIds.length === 0 || receivablePickSaving || !canSave
                        }
                      >
                        {receivablePickSaving ? "..." : (t("btnSave") || "저장")}
                      </Button>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
