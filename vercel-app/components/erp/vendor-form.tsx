"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Save,
  FilePlus,
  Building2,
  Tag,
  User,
  Phone,
  Mail,
  MapPin,
  RotateCcw,
  Map,
  FileText,
  Store,
  Landmark,
} from "lucide-react"
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
import Link from "next/link"
import type { VendorLinkedStore } from "@/components/erp/vendor-table"
import { VendorRdSearchButton } from "@/components/erp/vendor-rd-search"

export interface VendorFormData {
  code: string
  name: string
  gps_name: string
  sales_outlet: string
  contact: string
  phone: string
  email: string
  address: string
  tax_no: string
  type: "purchase" | "sales" | "both"
  memo: string
  direct_settlement: boolean
  bank_name: string
  bank_account_no: string
}

export interface VendorFormProps {
  formData: VendorFormData
  setFormData: React.Dispatch<React.SetStateAction<VendorFormData>>
  isEditing: boolean
  onSave: () => void
  onReset: () => void
  onNewRegister: () => void
  linkedStores?: VendorLinkedStore[]
}

export function VendorForm({
  formData,
  setFormData,
  isEditing,
  onSave,
  onReset,
  onNewRegister,
  linkedStores = [],
}: VendorFormProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const update = (key: keyof VendorFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground">{t("vendorFormTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {isEditing ? t("vendorFormEditDesc") : t("vendorFormNewDesc")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px] font-semibold" onClick={onNewRegister}>
          <FilePlus className="h-3.5 w-3.5" />
          {t("vendorBtnNewRegister")}
        </Button>
      </div>

      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Tag className="h-3.5 w-3.5 text-primary" />
            {t("vendorCode")}
          </label>
          <Input
            placeholder={t("vendorCodePh")}
            className="h-10 text-sm"
            value={formData.code}
            onChange={(e) => update("code", e.target.value)}
            disabled={isEditing}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Building2 className="h-3.5 w-3.5 text-success" />
              {t("vendorName")}
            </label>
            <VendorRdSearchButton
              triggerSize="sm"
              triggerVariant="ghost"
              triggerClassName="h-7 px-2 text-[11px]"
              initialQuery={formData.name || formData.tax_no}
              onPick={(c) => {
                setFormData((prev) => ({
                  ...prev,
                  name: c.name || prev.name,
                  tax_no: c.taxId || prev.tax_no,
                  address: c.address || prev.address,
                }))
              }}
            />
          </div>
          <Input
            placeholder={t("vendorNamePh")}
            className="h-10 text-sm"
            value={formData.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {t("vendorContact")}
            </label>
            <Input
              placeholder={t("vendorContactPh")}
              className="h-10 text-sm"
              value={formData.contact}
              onChange={(e) => update("contact", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {t("vendorPhone")}
            </label>
            <Input
              placeholder={t("vendorPhonePh")}
              className="h-10 text-sm"
              value={formData.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            {t("vendorEmail")}
          </label>
          <Input
            type="email"
            placeholder={t("vendorEmailPh")}
            className="h-10 text-sm"
            value={formData.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {t("vendorAddress")}
          </label>
          <Input
            placeholder={t("vendorAddressPh")}
            className="h-10 text-sm"
            value={formData.address}
            onChange={(e) => update("address", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            {t("vendorTaxNo")}
          </label>
          <Input
            placeholder={t("vendorTaxNoPh")}
            className="h-10 text-sm"
            value={formData.tax_no}
            onChange={(e) => update("tax_no", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
              {t("expensePayeeBankName") || "Bank"}
            </label>
            <Input
              placeholder="K-BANK / SCB / PromptPay"
              className="h-10 text-sm"
              value={formData.bank_name}
              onChange={(e) => update("bank_name", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
              {t("inv_account_no") || "Account"}
            </label>
            <Input
              placeholder={t("vendorBankAccountPh") || "Account number"}
              className="h-10 text-sm"
              value={formData.bank_account_no}
              onChange={(e) => update("bank_account_no", e.target.value)}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-3">
          {t("vendorBankHint") ||
            "Used on Expense Management bank-transfer view for payouts."}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Map className="h-3.5 w-3.5 text-muted-foreground" />
              {t("vendorGpsName")}
            </label>
            <Input
              placeholder={t("vendorGpsNamePh")}
              className="h-10 text-sm"
              value={formData.gps_name}
              onChange={(e) => update("gps_name", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">{t("vendorGpsNameHint")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
              {t("vendorSalesOutlet")}
            </label>
            <Input
              placeholder={t("vendorSalesOutletPh")}
              className="h-10 text-sm"
              value={formData.sales_outlet}
              onChange={(e) => update("sales_outlet", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">{t("vendorSalesOutletHint")}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">{t("vendorType")}</label>
          <Select value={formData.type} onValueChange={(v) => update("type", v as "purchase" | "sales" | "both")}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">{t("vendorTypePurchase")}</SelectItem>
              <SelectItem value="sales">{t("vendorTypeSales")}</SelectItem>
              <SelectItem value="both">{t("vendorTypeBoth")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="direct_settlement"
            checked={formData.direct_settlement}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, direct_settlement: checked === true }))
            }
          />
          <label
            htmlFor="direct_settlement"
            className="text-xs font-semibold text-foreground cursor-pointer"
          >
            {t("vendorDirectSettlement")}
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">{t("vendorMemo")}</label>
          <Input
            placeholder={t("vendorMemoPh")}
            className="h-10 text-sm"
            value={formData.memo}
            onChange={(e) => update("memo", e.target.value)}
          />
        </div>

        {isEditing && linkedStores.length > 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5 space-y-1.5">
            <div className="text-xs font-semibold text-foreground">{t("vendorFormLinkedStores")}</div>
            <div className="flex flex-wrap gap-1">
              {linkedStores.map((l) => (
                <span key={l.storeCode} className="inline-flex rounded-md bg-background border border-border/60 px-2 py-0.5 text-[11px]">
                  {l.storeCode}
                </span>
              ))}
            </div>
            <Button type="button" variant="link" className="h-auto p-0 text-[11px]" asChild>
              <Link href="/admin/tax-filing?tab=storeProfiles">{t("vendorFormOpenTaxProfiles")}</Link>
            </Button>
          </div>
        ) : isEditing ? (
          <p className="text-[11px] text-muted-foreground">{t("vendorFormLinkedStoresNone")}</p>
        ) : null}

        <div className="flex gap-3 pt-1">
          <Button className="flex-1 h-11 text-sm font-bold" onClick={onSave}>
            <Save className="mr-2 h-4 w-4" />
            {t("vendorBtnSave")}
          </Button>
          <Button variant="outline" className="h-11 px-5 text-sm font-semibold" onClick={onReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("vendorBtnReset")}
          </Button>
        </div>
      </div>
    </div>
  )
}
