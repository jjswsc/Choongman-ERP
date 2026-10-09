"use client"

import {
  ExpenseRegisterField,
  ExpenseRegisterFieldRow,
  ExpenseRegisterSection,
} from "@/components/erp/expense-register-form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus } from "lucide-react"
import { QuickAddVendorTriggerButton } from "@/components/erp/quick-add-vendor-dialog"
import { VendorRdSearchButton } from "@/components/erp/vendor-rd-search"
import type { AccountSubjectItem } from "@/lib/api-client"
import type * as React from "react"
import type { WithdrawalVendorOption, QuickAddVendorSeed } from "./withdrawal-management-tab-utils"

export type WithdrawalFixedAssetFieldsProps = {
  accountSubjectId: string
  assetCode: string
  assetName: string
  assetSubjectOptions: AccountSubjectItem[]
  getSubjectLabel: (s: AccountSubjectItem) => string
  openQuickAddVendor: (seed?: Partial<QuickAddVendorSeed>) => void
  payeeCode: string
  payeeManual: boolean
  payeeName: string
  setAccountSubjectId: React.Dispatch<React.SetStateAction<string>>
  setAssetCode: React.Dispatch<React.SetStateAction<string>>
  setAssetName: React.Dispatch<React.SetStateAction<string>>
  setPayeeCode: React.Dispatch<React.SetStateAction<string>>
  setPayeeManual: React.Dispatch<React.SetStateAction<boolean>>
  setPayeeName: React.Dispatch<React.SetStateAction<string>>
  setUsefulLifeMonths: React.Dispatch<React.SetStateAction<string>>
  tt: (key: string, fallback: string) => string
  usefulLifeMonths: string
  vendors: WithdrawalVendorOption[]
}

export function WithdrawalFixedAssetFields({
  accountSubjectId,
  assetCode,
  assetName,
  assetSubjectOptions,
  getSubjectLabel,
  openQuickAddVendor,
  payeeCode,
  payeeManual,
  payeeName,
  setAccountSubjectId,
  setAssetCode,
  setAssetName,
  setPayeeCode,
  setPayeeManual,
  setPayeeName,
  setUsefulLifeMonths,
  tt,
  usefulLifeMonths,
  vendors,
}: WithdrawalFixedAssetFieldsProps) {
  return (
    <ExpenseRegisterSection>
      <ExpenseRegisterFieldRow cols="auto">
      <ExpenseRegisterField label={tt("wm_assetName", "Asset Name")}>
        <Input
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
          placeholder={tt("wm_assetNamePlaceholder", "Vehicle, equipment, etc.")}
          className="h-9 w-full"
        />
      </ExpenseRegisterField>
      <ExpenseRegisterField label={tt("wm_assetCode", "Asset Code")}>
        <Input
          value={assetCode}
          onChange={(e) => setAssetCode(e.target.value)}
          placeholder={tt("wm_assetCodePlaceholder", "FA-001 (optional)")}
          className="h-9 w-full"
        />
      </ExpenseRegisterField>
      <ExpenseRegisterField label={tt("wm_usefulLife", "Useful Life (months)")}>
        <Input
          value={usefulLifeMonths}
          onChange={(e) => setUsefulLifeMonths(e.target.value)}
          type="number"
          min={1}
          className="h-9 w-full max-w-[140px]"
        />
      </ExpenseRegisterField>
      <ExpenseRegisterField
        label={tt("vendor", "Payee")}
        className="sm:col-span-2 lg:col-span-2 xl:col-span-2"
        hint={tt(
          "wm_fixedAssetPayeeHint",
          "Select the seller from vendor master. Required to link the bank withdrawal."
        )}
      >
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
              } else {
                setPayeeManual(false)
                setPayeeCode("")
                setPayeeName("")
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
      <ExpenseRegisterField label={tt("wm_accountSubject", "Account Subject")}>
        <Select
          value={accountSubjectId || "__none__"}
          onValueChange={(v) => setAccountSubjectId(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder={tt("wm_accountSubjectPlaceholder", "Select Account Subject")} />
          </SelectTrigger>
          <SelectContent>
            {assetSubjectOptions.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.code} {getSubjectLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ExpenseRegisterField>
      </ExpenseRegisterFieldRow>
    </ExpenseRegisterSection>
  )
}
