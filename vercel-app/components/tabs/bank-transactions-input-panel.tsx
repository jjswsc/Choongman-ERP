"use client"

import { TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Settings2, Upload, X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BANK_ACCOUNT_HQ_STORE_LABEL,
  displayBankAccountStore,
  formatBankAccountLabel,
} from "@/lib/bank-account-display"
import { Input } from "@/components/ui/input"
import { BankQuickMemoChipBar } from "./bank-misc-dialogs"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { BANK_WITHDRAW_UI_CATEGORIES, isBankWithdrawCategoryWithoutSubject } from "@/lib/bank-expense-via-expense-mgmt"
import { applyBankDepositCategorySelect, bankDepositCategorySelectValue } from "@/lib/pos-bank-chip-settlement"
import { type AccountSubjectItem, getVendorsForRelated } from "@/lib/api-client"
import { BankAdvanceTargetCell } from "@/components/erp/bank-advance-target-cell"
import { isBankDepositWithoutChannelGl } from "@/lib/bank-import-deposit-category"
import { cn } from "@/lib/utils"
import {
  type BankImportRowEdit,
  formatBankLedgerDepositCell,
  formatBankLedgerWithdrawCell,
  formatBankBaht,
} from "./bank-transactions-tab-utils"
import { defaultBankDepositSalesDateForRow } from "@/lib/pos-channel-reconcile-match"
import type * as React from "react"
import type { KDepositParsedResult } from "@/lib/parse-kdeposit-csv"

export type BankTransactionsInputPanelProps = {
  accountId: string
  accounts: { id: number; name: string; store: string; bankName?: string; openingBalance?: number; openingBalanceDate?: string | null; }[]
  addAccountSaving: boolean
  applyCarryOverSaving: boolean
  applyImportQuickMemo: (phrase: string) => void
  asDisplayName: (a: AccountSubjectItem) => string
  balanceMatch: boolean | null
  bankQuickMemos: string[]
  cardAccounts: { id: number; name: string; }[]
  clearBankImportDraft: () => void
  endStr: string
  fileInputRef: React.RefObject<HTMLInputElement | null>
  getCategoryLabel: (cat: string, transType: string) => string
  getDefaultImportCategory: (row: KDepositParsedResult["rows"][number]) => "receivable_receive" | "unclassified"
  getMemo: (memo: string | undefined) => string
  handleAddAccount: () => Promise<void>
  handleApplyCarryOver: () => Promise<void>
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleImportSave: () => Promise<void>
  hidePosRevenueCategories: boolean
  importMemoFocusIdxRef: React.RefObject<number | null>
  importPreview: KDepositParsedResult | null
  importRowEdits: Record<number, BankImportRowEdit>
  importSaving: boolean
  importStoreSearch: string
  importVendorSearch: string
  isOffice: boolean
  loadPurchaseVendorOptions: (forceFresh?: boolean) => Promise<void>
  newAccountBankName: string
  newAccountName: string
  newAccountStore: string
  openBankQuickMemosEdit: () => void
  pickRowAccountSubjectOptions: (transType: string, category: string) => AccountSubjectItem[]
  posStoreCategoryBanner: React.JSX.Element | null
  prepaymentSubject: AccountSubjectItem | undefined
  receivableOptions: string[]
  relatedVendorOptions: { code: string; name: string; }[]
  renderDepositCategorySelectItems: (currentCategory: string, hidePosRevenue: boolean, opts?: { includeQrChip?: boolean; }) => React.JSX.Element
  revenueAccountOptions: AccountSubjectItem[]
  selectedAccountStore: string
  setAccountId: React.Dispatch<React.SetStateAction<string>>
  setAccountManageOpen: React.Dispatch<React.SetStateAction<boolean>>
  setEditingAccountId: React.Dispatch<React.SetStateAction<number | null>>
  setImportPreview: React.Dispatch<React.SetStateAction<KDepositParsedResult | null>>
  setImportRowEdit: (idx: number, field: "category" | "accountSubjectId" | "note" | "salesDate" | "expenseDate" | "vendorCode" | "storeName", value: string) => void
  setImportRowEdits: React.Dispatch<React.SetStateAction<Record<number, BankImportRowEdit>>>
  setImportStoreSearch: React.Dispatch<React.SetStateAction<string>>
  setImportVendorSearch: React.Dispatch<React.SetStateAction<string>>
  setMemoPreviewText: React.Dispatch<React.SetStateAction<string | null>>
  setNewAccountBankName: React.Dispatch<React.SetStateAction<string>>
  setNewAccountName: React.Dispatch<React.SetStateAction<string>>
  setNewAccountStore: React.Dispatch<React.SetStateAction<string>>
  setRelatedVendorOptions: React.Dispatch<React.SetStateAction<{ code: string; name: string; }[]>>
  storeOptionsDeduped: string[]
  summary: { openingBalance: number; beginningBalance: number; periodDeposits: number; periodWithdrawals: number; calculatedBalance: number; } | null
  t: (k: string) => string
  tt: (key: string, fallback: string) => string
  vendorOptions: { code: string; name: string; }[]
}

export function BankTransactionsInputPanel({
  accountId,
  accounts,
  addAccountSaving,
  applyCarryOverSaving,
  applyImportQuickMemo,
  asDisplayName,
  balanceMatch,
  bankQuickMemos,
  cardAccounts,
  clearBankImportDraft,
  endStr,
  fileInputRef,
  getCategoryLabel,
  getDefaultImportCategory,
  getMemo,
  handleAddAccount,
  handleApplyCarryOver,
  handleFileUpload,
  handleImportSave,
  hidePosRevenueCategories,
  importMemoFocusIdxRef,
  importPreview,
  importRowEdits,
  importSaving,
  importStoreSearch,
  importVendorSearch,
  isOffice,
  loadPurchaseVendorOptions,
  newAccountBankName,
  newAccountName,
  newAccountStore,
  openBankQuickMemosEdit,
  pickRowAccountSubjectOptions,
  posStoreCategoryBanner,
  prepaymentSubject,
  receivableOptions,
  relatedVendorOptions,
  renderDepositCategorySelectItems,
  revenueAccountOptions,
  selectedAccountStore,
  setAccountId,
  setAccountManageOpen,
  setEditingAccountId,
  setImportPreview,
  setImportRowEdit,
  setImportRowEdits,
  setImportStoreSearch,
  setImportVendorSearch,
  setMemoPreviewText,
  setNewAccountBankName,
  setNewAccountName,
  setNewAccountStore,
  setRelatedVendorOptions,
  storeOptionsDeduped,
  summary,
  t,
  tt,
  vendorOptions,
}: BankTransactionsInputPanelProps) {
  return (
    <TabsContent value="input" className="mt-0">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {accounts.length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setAccountManageOpen(true); setEditingAccountId(null); }}
                >
                  <Settings2 className="h-4 w-4 mr-1" />
                  {t("bankAccountManage")}
                </Button>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={t("bankAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {formatBankAccountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!accountId}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {t("bankUploadCsv")}
                </Button>
              </>
            )}
            <div className={`flex flex-wrap items-center gap-2 ${accounts.length > 0 ? "border-l pl-3 ml-1" : ""}`}>
                <Input
                  placeholder={t("bankName") || "은행명"}
                  value={newAccountBankName}
                  onChange={(e) => setNewAccountBankName(e.target.value)}
                  className="max-w-[120px] h-9"
                />
                <Input
                  placeholder={t("bankAccount")}
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="max-w-[160px] h-9"
                />
                {isOffice && (
                  <Select value={newAccountStore || BANK_ACCOUNT_HQ_STORE_LABEL} onValueChange={setNewAccountStore}>
                    <SelectTrigger className="w-[110px] h-9">
                      <SelectValue placeholder={t("store") || "매장"} />
                    </SelectTrigger>
                    <SelectContent>
                      {storeOptionsDeduped.map((s) => (
                        <SelectItem key={s} value={s}>
                          {displayBankAccountStore(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" variant={accounts.length === 0 ? "default" : "outline"} onClick={handleAddAccount} disabled={addAccountSaving}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t("bankAddAccount")}
                </Button>
              </div>
          </div>
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground mb-4">{t("bankAddAccount")} - {t("bankNoAccountHintShort")}</p>
          )}
          {accounts.length > 0 && (
            <p className="text-sm text-muted-foreground mb-4">{t("bankAddSecondAccountHint")}</p>
          )}

          {importPreview && (
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-4 mb-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="font-medium text-amber-800 dark:text-amber-200">{t("bankImportPreview")}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearBankImportDraft()
                setImportPreview(null)
                setImportRowEdits({})
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>{importPreview.periodStart} ~ {importPreview.periodEnd}</span>
            <span>{t("bankStatementBalance")}: {formatBankBaht(importPreview.endingBalance)}</span>
            <span>{importPreview.rows.length} {t("receivPayCount")}</span>
          </div>
          {summary && importPreview.periodEnd === endStr && (
            <div className="flex flex-wrap items-center gap-2">
              <div className={`text-sm font-medium ${balanceMatch ? "text-green-600" : "text-destructive"}`}>
                {t("bankStatementBalance")}: {formatBankBaht(importPreview.endingBalance)} | {t("bankErpBalance")}: {formatBankBaht(summary.calculatedBalance)}{" "}
                {balanceMatch ? `✓ ${t("bankBalanceMatch")}` : `✗ ${t("bankBalanceMismatch")}`}
              </div>
              {!balanceMatch && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleApplyCarryOver}
                  disabled={applyCarryOverSaving}
                  className="shrink-0"
                >
                  {applyCarryOverSaving ? "..." : (t("bankApplyCarryOver") || "이월금액 적용")}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("bankImportDupHint") ||
              "같은 계좌·날짜·입출금·금액이면 DB에 이미 있는 줄과만 비교해 중복을 제외합니다. 메모(사용자)가 다르면 별개 건으로 저장됩니다."}
          </p>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {t("bankImportWithdrawCoaHint") || "※ 출금: 아래 표에서 용도·계정과목(매입 대금이면 거래처)을 선택하면 저장 시 통장에 반영됩니다. 적요 규칙으로 자동 채워집니다."}
          </p>
          {posStoreCategoryBanner}
          <BankQuickMemoChipBar
            phrases={bankQuickMemos}
            title={t("bankImportQuickMemosTitle") || "자주 쓰는 메모"}
            hint={
              t("bankImportQuickMemoHint") ||
              "메모 칸을 먼저 선택한 뒤 누르면 해당 줄에 붙고, 아니면 클립보드로 복사됩니다."
            }
            onPhrase={applyImportQuickMemo}
            onManageClick={openBankQuickMemosEdit}
            manageLabel={t("bankQuickMemosManage") || "편집"}
          />
          <AdminTableScroll className="max-h-[520px] overflow-x-auto overflow-y-auto border rounded" hint={false}>
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-center min-w-[96px]">{t("date")}</th>
                  <th className="p-2 text-center min-w-[64px]">{t("pettyColType")}</th>
                  <th className="p-2 text-center">{t("bankCategoryLabel")}</th>
                  <th className="p-2 text-center">{t("accountSubject")}</th>
                  <th className="p-2 text-right">{t("bankColDepositAmount") || "입금액"}</th>
                  <th className="p-2 text-right">{t("bankColWithdrawAmount") || "출금액"}</th>
                  <th className="p-2 text-center min-w-[220px]">{t("bankMemoLabel") || "은행 적요"}</th>
                  <th className="p-2 text-center min-w-[150px]">{t("bankNoteLabel") || "메모"}</th>
                  <th className="p-2 text-center whitespace-nowrap">{t("bankAttributedDate") || "인식일"}</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.map((r, idx) => {
                  const impRaw = importRowEdits[idx]?.category || getDefaultImportCategory(r)
                  const impCat = r.transType === "withdraw" && impRaw === "fixed" ? "expense" : impRaw
                  const isAutoAssigned = importRowEdits[idx]?.autoAssigned === true
                  return (
                  <tr key={idx} className={`border-t ${importRowEdits[idx]?.category === "correction" ? "bg-pink-50 dark:bg-pink-950/20" : ""}`}>
                    <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                    <td className="p-2 text-center whitespace-nowrap">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                    <td className="p-2">
                      {r.transType === "withdraw" ? (
                        <div className="space-y-1">
                          <Select
                            value={impCat}
                            onValueChange={(v) => setImportRowEdit(idx, "category", v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                              <SelectContent>
                              {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {getCategoryLabel(value, "withdraw")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isAutoAssigned ? (
                            <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              {tt("bankAutoAssignedBadge", "Auto")}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Select
                            value={bankDepositCategorySelectValue({
                              category: impRaw,
                              hidePosRevenue: hidePosRevenueCategories,
                              memo: r.memo,
                              note: importRowEdits[idx]?.note ?? "",
                            })}
                            onValueChange={(v) => {
                              const applied = applyBankDepositCategorySelect({
                                value: v,
                                transType: r.transType,
                                accountStore: selectedAccountStore,
                                currentNote: importRowEdits[idx]?.note ?? "",
                              })
                              setImportRowEdits((prev) => ({
                                ...prev,
                                [idx]: {
                                  ...prev[idx],
                                  category: applied.category,
                                  autoAssigned: false,
                                  ...(applied.note !== undefined ? { note: applied.note } : {}),
                                  ...(applied.storeName ? { storeName: applied.storeName } : {}),
                                },
                              }))
                            }}
                          >
                            <SelectTrigger
                              className="h-8 text-xs"
                              title={
                                hidePosRevenueCategories
                                  ? t("bankPosStoreCategorySelectTitle") ||
                                    "POS 매장: 배달앱·카드·QR·현금은 숨김. 오른쪽 「채널 정산」을 사용하세요."
                                  : undefined
                              }
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {renderDepositCategorySelectItems(impRaw, hidePosRevenueCategories)}
                            </SelectContent>
                          </Select>
                          {isAutoAssigned ? (
                            <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                              {tt("bankAutoAssignedBadge", "Auto")}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
                      {r.transType === "withdraw" && impCat === "purchase_payment" ? (
                        <Select
                          value={(importRowEdits[idx]?.vendorCode ?? "") || "__none__"}
                          onValueChange={(v) => setImportRowEdit(idx, "vendorCode", v === "__none__" ? "" : v)}
                          onOpenChange={(open) => {
                            if (!open) {
                              setImportVendorSearch("")
                              return
                            }
                            if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs max-w-[140px]">
                            <SelectValue placeholder={t("inVendorPlaceholder") || "거래처"} />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                              <Input
                                placeholder={t("search") || "검색"}
                                value={importVendorSearch}
                                onChange={(e) => setImportVendorSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-7 text-xs"
                              />
                            </div>
                            <SelectItem value="__none__">—</SelectItem>
                            {vendorOptions
                              .filter((v) => !importVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(importVendorSearch.trim().toLowerCase()))
                              .map((v) => (
                                <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : r.transType === "deposit" && (impCat === "loan" || impCat === "loan_borrow") ? (
                        <Select
                          value={(importRowEdits[idx]?.vendorCode ?? "") || "__none__"}
                          onValueChange={(v) => setImportRowEdit(idx, "vendorCode", v === "__none__" ? "" : v)}
                          onOpenChange={(open) => {
                            if (!open) {
                              setImportVendorSearch("")
                              return
                            }
                            if (relatedVendorOptions.length === 0) {
                              void getVendorsForRelated()
                                .catch(() => [])
                                .then((rows) =>
                                  setRelatedVendorOptions(
                                    (rows || []).map((x) => ({
                                      code: String(x.code),
                                      name: String(x.name || x.code),
                                    }))
                                  )
                                )
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs max-w-[140px]">
                            <SelectValue placeholder={t("wm_loan_party") || "관련당사자"} />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                              <Input
                                placeholder={t("search") || "검색"}
                                value={importVendorSearch}
                                onChange={(e) => setImportVendorSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-7 text-xs"
                              />
                            </div>
                            <SelectItem value="__none__">—</SelectItem>
                            {relatedVendorOptions
                              .filter((v) => !importVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(importVendorSearch.trim().toLowerCase()))
                              .map((v) => (
                                <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : impCat === "advance" ? (
                        <BankAdvanceTargetCell
                          storeName={importRowEdits[idx]?.storeName}
                          vendorCode={importRowEdits[idx]?.vendorCode}
                          prepaymentSubject={prepaymentSubject}
                          stores={receivableOptions}
                          vendors={vendorOptions}
                          cardAccounts={cardAccounts}
                          storeSearch={importStoreSearch}
                          onStoreSearchChange={setImportStoreSearch}
                          vendorSearch={importVendorSearch}
                          onVendorSearchChange={setImportVendorSearch}
                          onVendorDropdownOpen={() => {
                            if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                          }}
                          asDisplayName={asDisplayName}
                          t={t}
                          tt={tt}
                          onChange={(next) => {
                            setImportRowEdits((prev) => ({
                              ...prev,
                              [idx]: {
                                ...prev[idx],
                                storeName: next.storeName || undefined,
                                vendorCode: next.vendorCode || undefined,
                                ...(prepaymentSubject?.id
                                  ? { accountSubjectId: String(prepaymentSubject.id) }
                                  : {}),
                                autoAssigned: false,
                              },
                            }))
                          }}
                        />
                      ) : r.transType === "withdraw" &&
                        !isBankWithdrawCategoryWithoutSubject(impCat) ? (
                        <Select
                          value={
                            (importRowEdits[idx]?.accountSubjectId !== undefined
                              ? importRowEdits[idx]?.accountSubjectId
                              : "__none__") || "__none__"
                          }
                          onValueChange={(v) => setImportRowEdit(idx, "accountSubjectId", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-xs max-w-[140px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {pickRowAccountSubjectOptions(r.transType, impCat).map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : r.transType === "deposit" && impCat === "receivable_receive" ? (
                        <Select
                          value={importRowEdits[idx]?.storeName || selectedAccountStore || "__none__"}
                          onValueChange={(v) => setImportRowEdit(idx, "storeName", v === "__none__" ? "" : v)}
                          onOpenChange={(open) => !open && setImportStoreSearch("")}
                        >
                          <SelectTrigger className="h-8 text-xs max-w-[120px]">
                            <SelectValue placeholder={t("store") || "매장"} />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                              <Input
                                placeholder={t("search") || "검색"}
                                value={importStoreSearch}
                                onChange={(e) => setImportStoreSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="h-7 text-xs"
                              />
                            </div>
                            <SelectItem value="__none__">—</SelectItem>
                            {receivableOptions
                              .filter((s) => !importStoreSearch.trim() || (s || "").toLowerCase().includes(importStoreSearch.trim().toLowerCase()))
                              .map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : r.transType === "deposit" && !isBankDepositWithoutChannelGl(impCat) ? (
                        <Select
                          value={importRowEdits[idx]?.accountSubjectId || "__none__"}
                          onValueChange={(v) => setImportRowEdit(idx, "accountSubjectId", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className="h-8 text-xs max-w-[120px]">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {revenueAccountOptions.map((a) => (
                              <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : "—"}
                    </td>
                    <td
                      className={cn(
                        "p-2 text-right whitespace-nowrap tabular-nums",
                        r.transType === "deposit"
                          ? "text-green-600 dark:text-green-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatBankLedgerDepositCell(r.transType, r.amount)}
                    </td>
                    <td
                      className={cn(
                        "p-2 text-right whitespace-nowrap tabular-nums",
                        r.transType === "withdraw"
                          ? "text-orange-600 dark:text-orange-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {formatBankLedgerWithdrawCell(r.transType, r.amount)}
                    </td>
                    <td
                      className="p-2 min-w-[220px] max-w-[280px] truncate text-muted-foreground text-sm cursor-pointer hover:bg-muted/50 rounded"
                      onClick={() => r.memo?.trim() && setMemoPreviewText(r.memo)}
                      title={r.memo?.trim() ? r.memo : undefined}
                    >
                      {getMemo(r.memo)}
                    </td>
                    <td className="p-2">
                      <Input
                        placeholder={t("bankNotePlaceholder") || "메모 입력"}
                        value={importRowEdits[idx]?.note ?? ""}
                        onChange={(e) => setImportRowEdit(idx, "note", e.target.value)}
                        onFocus={() => {
                          importMemoFocusIdxRef.current = idx
                        }}
                        className="h-8 text-xs min-w-[150px]"
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {r.transType === "deposit" && !isBankDepositWithoutChannelGl(impCat) ? (
                        <Input
                          type="date"
                          value={
                            importRowEdits[idx]?.salesDate ||
                            defaultBankDepositSalesDateForRow({
                              transDate: r.transDate,
                              category: impCat,
                              accountSubjectCode: revenueAccountOptions.find(
                                (s) => Number(s.id) === Number(importRowEdits[idx]?.accountSubjectId)
                              )?.code,
                            })
                          }
                          onChange={(e) => setImportRowEdit(idx, "salesDate", e.target.value)}
                          className="h-8 text-xs w-[110px]"
                        />
                      ) : r.transType === "withdraw" && (impCat === "expense" || impCat === "purchase_payment") ? (
                        <Input
                          type="date"
                          value={importRowEdits[idx]?.expenseDate ?? r.transDate}
                          onChange={(e) => setImportRowEdit(idx, "expenseDate", e.target.value)}
                          className="h-8 text-xs w-[110px]"
                        />
                      ) : "—"}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </AdminTableScroll>
          <Button size="sm" onClick={handleImportSave} disabled={importSaving || !accountId}>
            {importSaving ? "..." : t("bankImportSave")}
          </Button>
        </div>
      )}
        </CardContent>
      </Card>
    </TabsContent>
  )
}
