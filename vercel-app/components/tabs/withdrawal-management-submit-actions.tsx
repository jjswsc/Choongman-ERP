"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Link2, Wallet } from "lucide-react"
import { isTransferPrepaymentKind, todayStrBkk, type TransferKind } from "./withdrawal-management-tab-utils"
import type { CardAccount } from "@/lib/api-client"
import type { useRouter } from "next/navigation"

export type WithdrawalSubmitActionsProps = {
  accountId: string
  autoCreateWhtCert: boolean
  categoryMain: string
  endStrParam: string | null
  handleSubmit: () => Promise<void>
  isBankLinkMode: boolean
  isEditAccrualMode: boolean
  isEditMode: boolean
  isLaterPayment: boolean
  payeeCode: string
  payeeManual: boolean
  payeeName: string
  returnOpenRegisterTxIdParam: string | null
  returnTabParam: string | null
  router: ReturnType<typeof useRouter>
  saving: boolean
  setAutoCreateWhtCert: (next: boolean) => void
  startStrParam: string | null
  supportsExpenseDocs: boolean
  transDate: string
  transferCardAccountsForStore: CardAccount[]
  transferKind: TransferKind
  transferToCardAccountId: string
  tt: (key: string, fallback: string) => string
  vendorCode: string
}

export function WithdrawalSubmitActions({
  accountId,
  autoCreateWhtCert,
  categoryMain,
  endStrParam,
  handleSubmit,
  isBankLinkMode,
  isEditAccrualMode,
  isEditMode,
  isLaterPayment,
  payeeCode,
  payeeManual,
  payeeName,
  returnOpenRegisterTxIdParam,
  returnTabParam,
  router,
  saving,
  setAutoCreateWhtCert,
  startStrParam,
  supportsExpenseDocs,
  transDate,
  transferCardAccountsForStore,
  transferKind,
  transferToCardAccountId,
  tt,
  vendorCode,
}: WithdrawalSubmitActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      {supportsExpenseDocs ? (
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none mr-1">
          <Checkbox
            checked={autoCreateWhtCert}
            onCheckedChange={(v) => setAutoCreateWhtCert(v === true)}
            disabled={saving}
          />
          <span className="text-muted-foreground leading-snug max-w-[280px]">
            {tt(
              "expenseAccrualAutoWhtCert",
              "Auto-create withholding tax certificate (50 ทวิ)"
            )}
          </span>
        </label>
      ) : null}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={
          saving ||
          !categoryMain ||
          (categoryMain === "transfer" &&
            transferKind === "bank_to_card" &&
            (!transferToCardAccountId || transferCardAccountsForStore.length === 0)) ||
          (isBankLinkMode &&
            ((categoryMain === "purchase" && !vendorCode.trim()) ||
              ((categoryMain === "expense" || categoryMain === "fixed_asset") &&
                !(payeeManual ? (payeeCode.trim() || payeeName.trim()) : payeeCode)))) ||
          (categoryMain === "fixed_asset" &&
            !(payeeManual ? (payeeCode.trim() || payeeName.trim()) : payeeCode))
        }
      >
        {categoryMain === "transfer" && transferKind === "bank_to_card" ? (
          <Link2 className="h-4 w-4 mr-1" />
        ) : (
          <Wallet className="h-4 w-4 mr-1" />
        )}
        {saving
          ? tt("loading", "Processing...")
          : isEditMode
            ? tt("btnSave", "Save")
            : isBankLinkMode
            ? categoryMain === "transfer" && transferKind === "bank_to_card"
              ? tt("wm_transferLinkThisBill", "이 출금을 카드에 연결")
              : categoryMain === "transfer" && isTransferPrepaymentKind(transferKind)
              ? tt("wm_transferLinkBank", "통장 연동")
              : tt("btnSave", "Save")
            : categoryMain === "transfer" && transferKind === "bank_to_card"
              ? tt("wm_transferLinkExistingBill", "이미 나간 출금 연결")
            : isLaterPayment
              ? isEditAccrualMode
                ? tt("btnSave", "Save")
                : tt("wm_registerAccrual", "Register Accrual")
              : tt("wm_execute", "Register Withdrawal")}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const q = new URLSearchParams()
          q.set("tab", returnTabParam || (isBankLinkMode ? "query" : "input"))
          if (accountId) q.set("accountId", accountId)
          const start = (startStrParam && /^\d{4}-\d{2}-\d{2}$/.test(startStrParam)) ? startStrParam : (transDate || todayStrBkk())
          const end = (endStrParam && /^\d{4}-\d{2}-\d{2}$/.test(endStrParam)) ? endStrParam : (transDate || todayStrBkk())
          q.set("startStr", start)
          q.set("endStr", end)
          if (returnOpenRegisterTxIdParam && Number(returnOpenRegisterTxIdParam) > 0) {
            q.set("openRegisterTxId", returnOpenRegisterTxIdParam)
          }
          router.push(`/admin/bank-transactions?${q.toString()}`)
        }}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {tt("wm_backToBank", "Back to Bank Screen")}
      </Button>
    </div>
  )
}
