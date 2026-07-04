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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PenLine, Trash2 } from "lucide-react"
import {
  BANK_ACCOUNT_HQ_STORE_LABEL,
  displayBankAccountStore,
  formatBankAccountLabel,
} from "@/lib/bank-account-display"
import { formatBahtAmountForField, formatBahtInputDisplay } from "@/lib/baht-input-format"
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from "@/lib/admin-ui-standards"
import type { BankAccountAuditLogItem } from "@/lib/api-client"

export type BankAccountRow = {
  id: number
  name: string
  store: string
  bankName?: string
  openingBalance?: number
  openingBalanceDate?: string | null
}

export type BankAccountEditForm = {
  name: string
  bankName: string
  store: string
  openingBalance: string
  openingBalanceDate: string
}

export interface BankAccountManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: BankAccountRow[]
  editingAccountId: number | null
  setEditingAccountId: (id: number | null) => void
  editAccountForm: BankAccountEditForm
  setEditAccountForm: React.Dispatch<React.SetStateAction<BankAccountEditForm>>
  isOffice: boolean
  storeOptionsDeduped: string[]
  accountManageSaving: boolean
  canDeleteBankAccountUi: boolean
  accountDeletingId: number | null
  canViewBankAccountAuditUi: boolean
  accountAuditLoading: boolean
  accountAuditLogs: BankAccountAuditLogItem[]
  handleSaveAccountEdit: () => void
  handleDeleteAccount: (id: number) => void
  t: (key: string) => string
  tt: (key: string, fallback: string) => string
}

export function BankAccountManageDialog({
  open,
  onOpenChange,
  accounts,
  editingAccountId,
  setEditingAccountId,
  editAccountForm,
  setEditAccountForm,
  isOffice,
  storeOptionsDeduped,
  accountManageSaving,
  canDeleteBankAccountUi,
  accountDeletingId,
  canViewBankAccountAuditUi,
  accountAuditLoading,
  accountAuditLogs,
  handleSaveAccountEdit,
  handleDeleteAccount,
  t,
  tt,
}: BankAccountManageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setEditingAccountId(null); } }}>
      <DialogContent className={`max-w-lg ${ADMIN_DIALOG_SCROLL_CN}`}>
        <DialogHeader>
          <DialogTitle>{t("bankAccountManage")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-auto">
          {accounts.length > 0 && (
            <p className="text-xs text-muted-foreground">{t("bankAddSecondAccountHint")}</p>
          )}
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("bankNoAccountHintShort")}</p>
          ) : (
            accounts.map((a) => (
              <div key={a.id} className="rounded-lg border p-3 space-y-2">
                {editingAccountId === a.id ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">{t("bankName") || "은행명"}</label>
                        <Input
                          value={editAccountForm.bankName}
                          onChange={(e) => setEditAccountForm((p) => ({ ...p, bankName: e.target.value }))}
                          className="h-8 text-sm"
                          placeholder={t("bankName")}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">{t("bankAccount")}</label>
                        <Input
                          value={editAccountForm.name}
                          onChange={(e) => setEditAccountForm((p) => ({ ...p, name: e.target.value }))}
                          className="h-8 text-sm"
                          placeholder={t("bankAccount")}
                        />
                      </div>
                    </div>
                    {isOffice && (
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">{t("store")}</label>
                        <Select value={editAccountForm.store || BANK_ACCOUNT_HQ_STORE_LABEL} onValueChange={(v) => setEditAccountForm((p) => ({ ...p, store: v }))}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {storeOptionsDeduped.map((s) => (
                              <SelectItem key={s} value={s}>
                                {displayBankAccountStore(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">{t("bankCarryOverAmount") || "이월금액"}</label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={editAccountForm.openingBalance}
                          onChange={(e) => setEditAccountForm((p) => ({ ...p, openingBalance: formatBahtInputDisplay(e.target.value) }))}
                          className="h-8 text-sm text-right"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-0.5">{t("bankCarryOverDate") || "기준일"}</label>
                        <Input
                          type="date"
                          value={editAccountForm.openingBalanceDate}
                          onChange={(e) => setEditAccountForm((p) => ({ ...p, openingBalanceDate: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => { setEditingAccountId(null); }} disabled={accountManageSaving}>
                        {t("cancel")}
                      </Button>
                      <Button size="sm" onClick={handleSaveAccountEdit} disabled={accountManageSaving || !editAccountForm.name.trim()}>
                        {accountManageSaving ? "..." : t("btn_save")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {formatBankAccountLabel(a)}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={ADMIN_BTN_XS_CN}
                          onClick={() => {
                            setEditingAccountId(a.id)
                            setEditAccountForm({
                              name: a.name,
                              bankName: a.bankName || "",
                              store: displayBankAccountStore(a.store) || BANK_ACCOUNT_HQ_STORE_LABEL,
                              openingBalance: formatBahtAmountForField(a.openingBalance),
                              openingBalanceDate: a.openingBalanceDate || "",
                            })
                          }}
                        >
                          <PenLine className="h-3.5 w-3.5" />
                        </Button>
                        {canDeleteBankAccountUi ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`${ADMIN_BTN_XS_CN} text-destructive hover:text-destructive`}
                            onClick={() => handleDeleteAccount(a.id)}
                            disabled={accountDeletingId !== null}
                          >
                            {accountDeletingId === a.id ? "..." : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          {!canDeleteBankAccountUi && accounts.length > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-200">{t("bankAccountDeleteOfficeOnly")}</p>
          )}
          {canViewBankAccountAuditUi && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium">{t("bankAccountAuditTitle")}</p>
              {accountAuditLoading ? (
                <p className="text-xs text-muted-foreground">...</p>
              ) : accountAuditLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("bankAccountAuditEmpty")}</p>
              ) : (
                <ul className="space-y-2 max-h-[220px] overflow-auto pr-1">
                  {accountAuditLogs.map((log) => {
                    const actionKey =
                      log.actionType === "create"
                        ? "bankAccountAuditActionCreate"
                        : log.actionType === "update"
                          ? "bankAccountAuditActionUpdate"
                          : log.actionType === "delete_denied"
                            ? "bankAccountAuditActionDeleteDenied"
                            : "bankAccountAuditActionDelete"
                    const payload = log.payload || {}
                    const txCount = payload.transactionCount != null ? Number(payload.transactionCount) : null
                    const actor = [log.actorName, log.actorRole ? `(${log.actorRole})` : null, log.actorStore ? `@ ${log.actorStore}` : null]
                      .filter(Boolean)
                      .join(" ")
                    const at = log.createdAt
                      ? new Date(log.createdAt).toLocaleString("sv-SE", { timeZone: "Asia/Bangkok", hour12: false }).replace("T", " ")
                      : "—"
                    const accountLabel = [log.bankName ? `[${log.bankName}]` : null, log.accountName || (log.accountId ? `#${log.accountId}` : null)]
                      .filter(Boolean)
                      .join(" ")
                    return (
                      <li key={log.id} className="text-xs rounded-md border px-2 py-1.5 space-y-0.5">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-between">
                          <span className="font-medium">{t(actionKey)}</span>
                          <span className="text-muted-foreground tabular-nums">{at}</span>
                        </div>
                        <div className="text-muted-foreground">
                          {accountLabel}
                          {log.accountStore ? ` · ${log.accountStore}` : ""}
                          {txCount != null && log.actionType === "delete" ? ` · ${txCount}${tt("receivPayCount", "건")}` : ""}
                        </div>
                        <div>{actor || "—"}</div>
                        {log.decision === "deny" && log.reasonCode ? (
                          <div className="text-amber-700 dark:text-amber-300">{log.reasonCode}</div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
