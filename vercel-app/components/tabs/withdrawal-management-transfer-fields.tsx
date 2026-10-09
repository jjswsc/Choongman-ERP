"use client"

import { ExpenseRegisterField } from "@/components/erp/expense-register-form-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TransferKind } from "./withdrawal-management-tab-utils"
import { Input } from "@/components/ui/input"
import { writeLastCardAccountId } from "@/lib/card-last-account"
import type { AccountSubjectItem, BankAccount, CardAccount } from "@/lib/api-client"
import type * as React from "react"

export type WithdrawalTransferFieldsProps = {
  accountId: string
  accountSubjectId: string
  getSubjectLabel: (s: AccountSubjectItem) => string
  isBankLinkMode: boolean
  pettyCashStoreOptions: string[]
  setAccountId: React.Dispatch<React.SetStateAction<string>>
  setAccountSubjectId: React.Dispatch<React.SetStateAction<string>>
  setTransferBankAccountNo: React.Dispatch<React.SetStateAction<string>>
  setTransferBankRecipientName: React.Dispatch<React.SetStateAction<string>>
  setTransferKind: React.Dispatch<React.SetStateAction<TransferKind>>
  setTransferToCardAccountId: React.Dispatch<React.SetStateAction<string>>
  setTransferToPettyStore: React.Dispatch<React.SetStateAction<string>>
  storeName: string
  transferBankAccountNo: string
  transferBankAccountsForStore: BankAccount[]
  transferBankRecipientName: string
  transferCardAccountsForStore: CardAccount[]
  transferKind: TransferKind
  transferSubjects: AccountSubjectItem[]
  transferToCardAccountId: string
  transferToPettyStore: string
  tt: (key: string, fallback: string) => string
}

export function WithdrawalTransferFields({
  accountId,
  accountSubjectId,
  getSubjectLabel,
  isBankLinkMode,
  pettyCashStoreOptions,
  setAccountId,
  setAccountSubjectId,
  setTransferBankAccountNo,
  setTransferBankRecipientName,
  setTransferKind,
  setTransferToCardAccountId,
  setTransferToPettyStore,
  storeName,
  transferBankAccountNo,
  transferBankAccountsForStore,
  transferBankRecipientName,
  transferCardAccountsForStore,
  transferKind,
  transferSubjects,
  transferToCardAccountId,
  transferToPettyStore,
  tt,
}: WithdrawalTransferFieldsProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-4 max-w-3xl">
      <ExpenseRegisterField
        label={tt("wm_transferKind", "이체 유형")}
        hint={
          isBankLinkMode
            ? transferKind === "bank_to_card"
              ? tt(
                  "wm_transferKindHintBankToCardLink",
                  "통장에서 이미 나간 출금입니다. 저장하면 카드 탭 연동 대기열에 등록됩니다."
                )
              : transferKind === "bank_to_petty"
                ? tt(
                    "wm_transferKindHintBankToPettyLink",
                    "통장에서 이미 나간 출금입니다. 저장하면 패티 캐쉬 탭 연동 대기열에 등록됩니다."
                  )
                : tt(
                    "wm_transferKindHintBankGeneralLink",
                    "통장에서 이미 나간 일반 이체입니다. 이체 계정과목을 선택한 뒤 저장하세요."
                  )
            : transferKind === "bank_to_card"
              ? tt(
                  "wm_transferKindHintBankToCard",
                  "카드·금액 입력 후 지급예정 저장 → 승인 → 통장 송금 건과 연동하세요. (통장에서는 「지급예정 선택」도 가능)"
                )
              : transferKind === "bank_to_petty"
                ? tt(
                    "wm_transferKindHintBankToPetty",
                    "매장·금액 입력 후 지급예정 저장 → 승인 → 통장 송금 건과 연동하세요. (분개: 1160/1010)"
                  )
                : tt(
                    "wm_transferKindHintBankGeneral",
                    "이체용 계정과목·금액 입력 후 저장하면 통장 출금으로 등록됩니다."
                  )
        }
      >
        <Select
          value={transferKind}
          onValueChange={(v) => {
            setTransferKind(v as TransferKind)
            if (v !== "bank_to_card") setTransferToCardAccountId("")
            if (v !== "bank_general") {
              setAccountSubjectId("")
              setTransferBankAccountNo("")
              setTransferBankRecipientName("")
            }
            if (v !== "bank_to_petty") setTransferToPettyStore("")
          }}
        >
          <SelectTrigger className="h-9 w-full max-w-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bank_to_petty">{tt("wm_transferKindBankToPetty", "통장 → 패티캐시")}</SelectItem>
            <SelectItem value="bank_to_card">{tt("wm_transferKindBankToCard", "통장 → 카드 대금")}</SelectItem>
            <SelectItem value="bank_general">{tt("wm_transferKindBankGeneral", "일반 이체")}</SelectItem>
          </SelectContent>
        </Select>
      </ExpenseRegisterField>

      <ExpenseRegisterField
        label={tt("bankAccount", "Account")}
        className="max-w-md"
        hint={
          !storeName
            ? tt("expenseStoreSelect", "매장을 먼저 선택하세요.")
            : undefined
        }
      >
        <Select value={accountId || "__none__"} onValueChange={(v) => setAccountId(v === "__none__" ? "" : v)} disabled={isBankLinkMode}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder={tt("bankAccount", "Select Account")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {transferBankAccountsForStore.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.bankName ? `[${a.bankName}] ` : ""}{a.name}{a.store ? ` (${a.store})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ExpenseRegisterField>

      {transferKind === "bank_to_petty" && (
        <ExpenseRegisterField
          label={tt("wm_transferToPetty", "패티캐시 매장")}
          className="max-w-md"
          hint={tt("pettyBankLinkJournalHint", "분개: 차변·대변 현금(1010) — 내부 자금 이동")}
        >
          <Select
            value={transferToPettyStore || "__none__"}
            onValueChange={(v) => setTransferToPettyStore(v === "__none__" ? "" : v)}
            disabled={isBankLinkMode}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={tt("wm_transferToPetty", "패티캐시 매장")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {pettyCashStoreOptions.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ExpenseRegisterField>
      )}

      {transferKind === "bank_general" && (
        <>
          <ExpenseRegisterField label={tt("wm_transferAccountSubject", "이체 계정과목")} className="max-w-md">
            <Select value={accountSubjectId || "__none__"} onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={tt("wm_transferAccountSubjectPlaceholder", "이체 계정과목 선택")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {transferSubjects.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.code} {getSubjectLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ExpenseRegisterField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 max-w-xl">
            <ExpenseRegisterField label={tt("inv_account_no", "계좌번호")}>
              <Input
                value={transferBankAccountNo}
                onChange={(e) => setTransferBankAccountNo(e.target.value)}
                placeholder={tt("wm_transferAccountNoPlaceholder", "계좌번호 입력")}
                className="h-9"
                readOnly={isBankLinkMode}
              />
            </ExpenseRegisterField>
            <ExpenseRegisterField label={tt("wm_transferRecipient", "받는 사람")}>
              <Input
                value={transferBankRecipientName}
                onChange={(e) => setTransferBankRecipientName(e.target.value)}
                placeholder={tt("wm_transferRecipientPlaceholder", "받는 사람 입력")}
                className="h-9"
                readOnly={isBankLinkMode}
              />
            </ExpenseRegisterField>
          </div>
          <p className="text-xs text-muted-foreground">
            {tt(
              "wm_transferGeneralInputHint",
              "계정과목으로 내부 이체하거나, 외부 계좌·받는 사람을 입력해 외부 이체로 등록할 수 있습니다."
            )}
          </p>
        </>
      )}

      {transferKind === "bank_to_card" && (
        <>
        <ExpenseRegisterField
          label={tt("wm_transferToCardCharge", "연결할 카드")}
          className="max-w-md"
          hint={
            transferCardAccountsForStore.length === 0
              ? tt("cardManagementNoCardsHint", "연결할 카드가 없습니다. 위에서 카드를 먼저 등록하세요.")
              : tt("wm_transferCardLinkAfterHint", "어느 카드로 쓴 지출인지 지정합니다. 출금 연결 후 계정과목·텍스인보이스를 맞춥니다.")
          }
        >
          <Select
            value={transferToCardAccountId || "__none__"}
            onValueChange={(v) => {
              const id = v === "__none__" ? "" : v
              setTransferToCardAccountId(id)
              if (id) writeLastCardAccountId(id)
            }}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue placeholder={tt("cardManagementSelectCard", "Select Card")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {transferCardAccountsForStore.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}{a.store ? ` (${a.store})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ExpenseRegisterField>
        </>
      )}
    </div>
  )
}
