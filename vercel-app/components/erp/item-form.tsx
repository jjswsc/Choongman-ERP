"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Save,
  FilePlus,
  Package,
  Link2,
  Tag,
  Ruler,
  DollarSign,
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
export interface ItemFormData {
  code: string
  category: string
  vendor: string
  name: string
  imageUrl: string
  taxType: "taxable" | "exempt" | "zero"
  spec: string
  price: string
  cost: string
}

export interface ItemFormProps {
  formData: ItemFormData
  setFormData: React.Dispatch<React.SetStateAction<ItemFormData>>
  isEditing: boolean
  onSave: () => void
  onReset: () => void
  onNewRegister: () => void
}

export function ItemForm({ formData, setFormData, isEditing, onSave, onReset, onNewRegister }: ItemFormProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const update = (key: keyof ItemFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground">{t("itemsFormTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {isEditing ? t("itemsFormEditDesc") : t("itemsFormNewDesc")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px] font-semibold" onClick={onNewRegister}>
          <FilePlus className="h-3.5 w-3.5" />
          {t("itemsBtnNewRegister")}
        </Button>
      </div>

      <div className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Tag className="h-3.5 w-3.5 text-primary" />
            {t("itemsCode")}
          </label>
          <Input
            placeholder={t("itemsCodePh")}
            className="h-10 text-sm"
            value={formData.code}
            onChange={(e) => update("code", e.target.value)}
            disabled={isEditing}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("itemsCategory")}</label>
            <Input
              placeholder={t("itemsCategoryPh")}
              className="h-10 text-sm"
              value={formData.category}
              onChange={(e) => update("category", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span>{t("itemsVendor")}</span>
              <button type="button" className="text-[11px] font-semibold text-primary hover:underline">
                {t("itemsVendorPh")}
              </button>
            </label>
            <Input
              placeholder={t("itemsVendorPh")}
              className="h-10 text-sm"
              value={formData.vendor}
              onChange={(e) => update("vendor", e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Package className="h-3.5 w-3.5 text-success" />
            {t("itemsName")}
          </label>
          <Input
            placeholder={t("itemsNamePh")}
            className="h-10 text-sm"
            value={formData.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            {t("itemsImageLink")}
          </label>
          <Input
            placeholder={t("itemsImagePh")}
            className="h-10 text-sm"
            value={formData.imageUrl}
            onChange={(e) => update("imageUrl", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <DollarSign className="h-3.5 w-3.5 text-warning" />
            {t("itemsTaxType")}
          </label>
          <Select value={formData.taxType} onValueChange={(v) => update("taxType", v as "taxable" | "exempt" | "zero")}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="taxable">{t("itemsTaxable")}</SelectItem>
              <SelectItem value="exempt">{t("itemsExempt")}</SelectItem>
              <SelectItem value="zero">{t("itemsZero")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            {t("itemsSpec")}
          </label>
          <Input
            placeholder={t("itemsSpecPh")}
            className="h-10 text-sm"
            value={formData.spec}
            onChange={(e) => update("spec", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("itemsPrice")}</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                className="h-10 pr-8 text-sm text-right tabular-nums"
                value={formData.price}
                onChange={(e) => update("price", e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">฿</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("itemsCost")}</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                className="h-10 pr-8 text-sm text-right tabular-nums"
                value={formData.cost}
                onChange={(e) => update("cost", e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">฿</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button className="flex-1 h-11 text-sm font-bold" onClick={onSave}>
            <Save className="mr-2 h-4 w-4" />
            {t("itemsBtnSave")}
          </Button>
          <Button variant="outline" className="h-11 px-5 text-sm font-semibold" onClick={onReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("itemsBtnReset")}
          </Button>
        </div>
      </div>
    </div>
  )
}
