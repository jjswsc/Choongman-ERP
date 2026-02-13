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

export interface VendorFormData {
  code: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  type: "purchase" | "sales" | "both"
  memo: string
}

export interface VendorFormProps {
  formData: VendorFormData
  setFormData: React.Dispatch<React.SetStateAction<VendorFormData>>
  isEditing: boolean
  onSave: () => void
  onReset: () => void
  onNewRegister: () => void
}

export function VendorForm({ formData, setFormData, isEditing, onSave, onReset, onNewRegister }: VendorFormProps) {
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
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Building2 className="h-3.5 w-3.5 text-success" />
            {t("vendorName")}
          </label>
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

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">{t("vendorMemo")}</label>
          <Input
            placeholder={t("vendorMemoPh")}
            className="h-10 text-sm"
            value={formData.memo}
            onChange={(e) => update("memo", e.target.value)}
          />
        </div>

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
