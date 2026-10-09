"use client"

import {
  ExpenseRegisterField,
  ExpenseRegisterFieldRow,
  ExpenseRegisterSection,
} from "@/components/erp/expense-register-form-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"
import { QuickAddVendorTriggerButton } from "@/components/erp/quick-add-vendor-dialog"
import { VendorRdSearchButton } from "@/components/erp/vendor-rd-search"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { AccountSubjectItem, InboundBatchForLink } from "@/lib/api-client"
import type * as React from "react"
import type { WithdrawalVendorOption, QuickAddVendorSeed } from "./withdrawal-management-tab-utils"

export type WithdrawalPurchaseExpenseFieldsProps = {
  accountSubjectId: string
  categoryMain: "purchase" | "expense" | "loan"
  expenseSubjectOptions: AccountSubjectItem[]
  getSubjectLabel: (s: AccountSubjectItem) => string
  inboundBatchesForLink: InboundBatchForLink[]
  inboundLinkAmounts: Record<number, string>
  inboundLinkLoading: boolean
  isBankLinkMode: boolean
  isEditMode: boolean
  isLaterPayment: boolean
  loadInboundBatchesForLink: () => Promise<void>
  openQuickAddVendor: (seed?: Partial<QuickAddVendorSeed>) => void
  payeeAccountHolder: string
  payeeBankAccountNo: string
  payeeBankName: string
  payeeCode: string
  payeeManual: boolean
  payeeName: string
  resolvePurchaseVendorPayee: (codeRaw: string) => { code: string; name: string; }
  setAccountSubjectId: React.Dispatch<React.SetStateAction<string>>
  setInboundLinkAmounts: React.Dispatch<React.SetStateAction<Record<number, string>>>
  setPayeeAccountHolder: React.Dispatch<React.SetStateAction<string>>
  setPayeeBankAccountNo: React.Dispatch<React.SetStateAction<string>>
  setPayeeBankName: React.Dispatch<React.SetStateAction<string>>
  setPayeeCode: React.Dispatch<React.SetStateAction<string>>
  setPayeeManual: React.Dispatch<React.SetStateAction<boolean>>
  setPayeeName: React.Dispatch<React.SetStateAction<string>>
  setVendorCode: React.Dispatch<React.SetStateAction<string>>
  tt: (key: string, fallback: string) => string
  vendorCode: string
  vendors: WithdrawalVendorOption[]
}

export function WithdrawalPurchaseExpenseFields({
  accountSubjectId,
  categoryMain,
  expenseSubjectOptions,
  getSubjectLabel,
  inboundBatchesForLink,
  inboundLinkAmounts,
  inboundLinkLoading,
  isBankLinkMode,
  isEditMode,
  isLaterPayment,
  loadInboundBatchesForLink,
  openQuickAddVendor,
  payeeAccountHolder,
  payeeBankAccountNo,
  payeeBankName,
  payeeCode,
  payeeManual,
  payeeName,
  resolvePurchaseVendorPayee,
  setAccountSubjectId,
  setInboundLinkAmounts,
  setPayeeAccountHolder,
  setPayeeBankAccountNo,
  setPayeeBankName,
  setPayeeCode,
  setPayeeManual,
  setPayeeName,
  setVendorCode,
  tt,
  vendorCode,
  vendors,
}: WithdrawalPurchaseExpenseFieldsProps) {
  return (
    <>
      {categoryMain === "purchase" && (
        <ExpenseRegisterSection>
          <ExpenseRegisterFieldRow cols="payee">
          <ExpenseRegisterField label={tt("vendor", "Vendor")} className="sm:col-span-2 xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={vendorCode}
                onValueChange={(v) => {
                  if (v === "__add_vendor__") {
                    openQuickAddVendor()
                    return
                  }
                  setVendorCode(v)
                  const resolved = resolvePurchaseVendorPayee(v)
                  if (resolved.code) {
                    setPayeeCode(resolved.code)
                    setPayeeName(resolved.name)
                    setPayeeManual(false)
                  }
                }}
              >
                <SelectTrigger className="h-9 w-full min-w-[160px] max-w-[240px]">
                  <SelectValue placeholder={tt("vendor", "Select Vendor")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__add_vendor__" className="text-primary font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {tt("vendorQuickAdd", "Add vendor")}
                    </span>
                  </SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.code} value={v.code}>
                      {v.name} ({v.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <QuickAddVendorTriggerButton onClick={() => openQuickAddVendor()} />
              <VendorRdSearchButton
                triggerSize="sm"
                triggerVariant="outline"
                triggerClassName="h-9"
                onPick={(c) => {
                  const matched = vendors.find(
                    (v) =>
                      String((v as { taxId?: string; tax_id?: string }).taxId || (v as { tax_id?: string }).tax_id || "").replace(/\D/g, "") ===
                        c.taxId ||
                      v.name.trim() === c.name.trim()
                  )
                  if (matched) {
                    setVendorCode(matched.code)
                    setPayeeCode(matched.code)
                    setPayeeName(matched.name)
                    setPayeeManual(false)
                  } else {
                    openQuickAddVendor({ name: c.name, taxId: c.taxId })
                  }
                }}
              />
            </div>
          </ExpenseRegisterField>
          {vendorCode && (
            <>
              <ExpenseRegisterField label={tt("expensePayeeAccountHolder", "Account holder")}>
                <Input
                  className="h-9 w-full"
                  value={payeeAccountHolder}
                  onChange={(e) => setPayeeAccountHolder(e.target.value)}
                  placeholder={vendors.find((x) => x.code === vendorCode)?.name || ""}
                />
              </ExpenseRegisterField>
              <ExpenseRegisterField label={tt("expensePayeeBankName", "Bank")}>
                <Input
                  className="h-9 w-full"
                  value={payeeBankName}
                  onChange={(e) => setPayeeBankName(e.target.value)}
                  placeholder="K-BANK"
                />
              </ExpenseRegisterField>
              <ExpenseRegisterField label={tt("inv_account_no", "Account")}>
                <Input
                  className="h-9 w-full"
                  value={payeeBankAccountNo}
                  onChange={(e) => setPayeeBankAccountNo(e.target.value)}
                  placeholder={
                    vendors.find((x) => x.code === vendorCode)?.bankAccountNo || "—"
                  }
                />
              </ExpenseRegisterField>
            </>
          )}
          </ExpenseRegisterFieldRow>
          {vendorCode ? (
            <p className="text-[11px] leading-snug text-muted-foreground -mt-1">
              {tt(
                "expensePayeeBankRegisterHint",
                "Saved on this expense for bank transfer. Also updates the vendor master when a vendor is selected."
              )}
            </p>
          ) : null}
        </ExpenseRegisterSection>
      )}
      {categoryMain === "purchase" && vendorCode && !isBankLinkMode && !isEditMode && (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {tt("adminInbound", "Inbound")} {tt("inboundLinkLabel", "Link")} ({tt("optional", "Optional")})
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={loadInboundBatchesForLink}
              disabled={inboundLinkLoading}
            >
              {tt("store_refresh", "Refresh")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tt("inboundLinkAtRegisterHint", "You can link here when registering (optional). You can also link or edit later in the Bank tab.")}
          </p>
          {inboundLinkLoading ? (
            <p className="text-sm text-muted-foreground py-2">{tt("loading", "Loading...")}</p>
          ) : inboundBatchesForLink.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tt("inboundNoBatches", "No inbound batches for this vendor.")}</p>
          ) : (
            <>
              <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
                {inboundBatchesForLink.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 p-2">
                    <div className="flex-1 min-w-0 text-sm">
                      <span>{b.batchDate}</span>
                      <span className="text-muted-foreground ml-2">
                        {b.vendorName} · {(b.totalAmount || 0).toLocaleString()} ฿
                      </span>
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      className="w-24 h-8 text-right"
                      value={inboundLinkAmounts[b.id] || ""}
                      onChange={(e) => {
                        const next = String(e.target.value).replace(/[^\d.,]/g, "").replace(/,/g, "")
                        const parts = next.split(".")
                        const normalized = parts.length <= 1
                          ? next
                          : `${parts[0]}.${parts.slice(1).join("").slice(0, 2)}`
                        setInboundLinkAmounts((prev) => ({ ...prev, [b.id]: normalized }))
                      }}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLaterPayment
                  ? tt(
                      "inboundLinkAccrualHelp",
                      "For pay-later registration, linked batch amounts are used as the total when the total field is empty."
                    )
                  : tt(
                      "inboundLinkRegisterHelp",
                      "Enter amounts by batch to match the withdrawal amount for auto-linking. Leave blank to link later in Bank tab."
                    )}
              </p>
            </>
          )}
        </div>
      )}
      {categoryMain === "expense" && (
        <ExpenseRegisterSection>
          <ExpenseRegisterFieldRow cols="payee">
          <ExpenseRegisterField label={tt("vendor", "Payee")} className="sm:col-span-2 xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={payeeManual ? "__manual__" : (payeeCode || "__none__")}
                onValueChange={(v) => {
                  if (v === "__add_vendor__") {
                    openQuickAddVendor()
                    return
                  }
                  if (v === "__manual__") {
                    setPayeeManual(true)
                    setPayeeCode("")
                    setPayeeName("")
                  } else if (v !== "__none__") {
                    setPayeeManual(false)
                    setPayeeCode(v)
                    const found = vendors.find((x) => x.code === v)
                    setPayeeName(found?.name || v)
                  }
                }}
              >
                <SelectTrigger className="w-full min-w-[140px] max-w-[200px] h-9">
                  <SelectValue placeholder={tt("vendor", "Payee")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__add_vendor__" className="text-primary font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {tt("vendorQuickAdd", "Add vendor")}
                    </span>
                  </SelectItem>
                  <SelectItem value="__manual__">{tt("bankRegisterPayeeManual", "Enter Manually")}</SelectItem>
                  <SelectItem value="__none__">-</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.code} value={v.code}>{v.name} ({v.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {payeeManual ? (
                <>
                  <Input
                    className="w-[120px] h-9"
                    value={payeeCode}
                    onChange={(e) => setPayeeCode(e.target.value)}
                    placeholder={tt("expensePayeeCode", "Code")}
                  />
                  <Input
                    className="w-[160px] h-9"
                    value={payeeName}
                    onChange={(e) => setPayeeName(e.target.value)}
                    placeholder={tt("expensePayeeName", "Payee Name")}
                  />
                </>
              ) : (
                <Input
                  className="w-[160px] h-9"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder={tt("expensePayeeName", "Payee Name")}
                />
              )}
              <QuickAddVendorTriggerButton onClick={() => openQuickAddVendor()} />
              <VendorRdSearchButton
                triggerSize="sm"
                triggerVariant="outline"
                triggerClassName="h-9"
                initialQuery={payeeName}
                onPick={(c) => {
                  const matched = vendors.find(
                    (v) =>
                      String((v as { taxId?: string; tax_id?: string }).taxId || (v as { tax_id?: string }).tax_id || "").replace(/\D/g, "") ===
                        c.taxId ||
                      v.name.trim() === c.name.trim()
                  )
                  if (matched) {
                    setPayeeManual(false)
                    setPayeeCode(matched.code)
                    setPayeeName(matched.name)
                  } else {
                    openQuickAddVendor({ name: c.name, taxId: c.taxId })
                  }
                }}
              />
            </div>
          </ExpenseRegisterField>
          <ExpenseRegisterField label={tt("expensePayeeAccountHolder", "Account holder")}>
            <Input
              className="h-9 w-full"
              value={payeeAccountHolder}
              onChange={(e) => setPayeeAccountHolder(e.target.value)}
              placeholder={payeeName || ""}
            />
          </ExpenseRegisterField>
          <ExpenseRegisterField label={tt("expensePayeeBankName", "Bank")}>
            <Input
              className="h-9 w-full"
              value={payeeBankName}
              onChange={(e) => setPayeeBankName(e.target.value)}
              placeholder="K-BANK"
            />
          </ExpenseRegisterField>
          <ExpenseRegisterField label={tt("inv_account_no", "Account")}>
            <Input
              className="h-9 w-full"
              value={payeeBankAccountNo}
              onChange={(e) => setPayeeBankAccountNo(e.target.value)}
            />
          </ExpenseRegisterField>
          <ExpenseRegisterField label={tt("wm_accountSubject", "Account Subject")}>
            <Select
              value={accountSubjectId || "__none__"}
              onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={tt("wm_accountSubjectPlaceholder", "Select Account Subject")} />
              </SelectTrigger>
              <SelectContent>
                {isLaterPayment ? <SelectItem value="__none__">-</SelectItem> : null}
                {expenseSubjectOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.code} {getSubjectLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ExpenseRegisterField>
          </ExpenseRegisterFieldRow>
        </ExpenseRegisterSection>
      )}
    </>
  )
}
