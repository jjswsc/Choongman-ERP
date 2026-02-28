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
  ChevronDown,
  AlignLeft,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getVendorsForPurchase } from "@/lib/api-client"
const UNIT_OPTIONS = ['', 'kg', 'g', 'L', 'ml', '개', '팩', 'oz', 'lb']

export interface ItemFormData {
  code: string
  category: string
  vendor: string
  outboundLocation: string
  name: string
  imageUrl: string
  taxType: "taxable" | "exempt" | "zero"
  spec: string
  unit: string
  totalQuantity: string
  description: string
  price: string
  cost: string
  purchaseSource: "hq" | "store"
}

export interface ItemFormProps {
  formData: ItemFormData
  setFormData: React.Dispatch<React.SetStateAction<ItemFormData>>
  isEditing: boolean
  onSave: () => void
  onReset: () => void
  onNewRegister: () => void
  categories?: string[]
  outboundLocations?: { location_code: string; name: string }[]
}

export function ItemForm({ formData, setFormData, isEditing, onSave, onReset, onNewRegister, categories = [], outboundLocations = [] }: ItemFormProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [vendorList, setVendorList] = React.useState<{ code: string; name: string; address: string }[]>([])
  const [vendorOpen, setVendorOpen] = React.useState(false)
  const [categoryOpen, setCategoryOpen] = React.useState(false)

  const update = (key: keyof ItemFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  React.useEffect(() => {
    if (vendorOpen && vendorList.length === 0) {
      getVendorsForPurchase().then((list) => setVendorList(list || []))
    }
  }, [vendorOpen, vendorList.length])

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
        <div className="grid grid-cols-2 gap-4">
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
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">{t("itemsPurchaseSource") || "구분"}</label>
          <Select
            value={formData.purchaseSource ?? "hq"}
            onValueChange={(v) => {
              const next = v as "hq" | "store"
              update("purchaseSource", next)
              if (next === "store" && !formData.category.trim()) {
                update("category", "Store Only")
              }
            }}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hq">{t("itemsPurchaseSourceHq") || "본사 전용"}</SelectItem>
              <SelectItem value="store">{t("itemsPurchaseSourceStore") || "매장 전용"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("itemsCategory")}</label>
            <DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}>
              <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden">
                <Input
                  placeholder={t("itemsCategoryPh")}
                  className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={formData.category}
                  onChange={(e) => update("category", e.target.value)}
                  onFocus={() => setCategoryOpen(true)}
                />
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
                {categories.map((c) => (
                    <DropdownMenuItem
                      key={c}
                      onClick={() => {
                        update("category", c)
                        setCategoryOpen(false)
                      }}
                    >
                      {c}
                    </DropdownMenuItem>
                  ))}
                {formData.category.trim() &&
                  !categories.some((c) => c.toLowerCase() === formData.category.trim().toLowerCase()) && (
                  <DropdownMenuItem
                    onClick={() => {
                      update("category", formData.category.trim())
                      setCategoryOpen(false)
                    }}
                    className="text-primary font-medium"
                  >
                    + {t("itemsCategoryNew")}: {formData.category.trim()}
                  </DropdownMenuItem>
                )}
                {categories.length === 0 && !formData.category && (
                  <DropdownMenuItem disabled>{t("itemsCategoryTypeNew")}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("itemsVendorPh")}</label>
            <DropdownMenu open={vendorOpen} onOpenChange={setVendorOpen}>
              <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden">
                <Input
                  placeholder={t("itemsVendorPh")}
                  className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={formData.vendor}
                  onChange={(e) => update("vendor", e.target.value)}
                  onFocus={() => setVendorOpen(true)}
                />
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent align="start" className="max-h-60 min-w-[320px] w-max max-w-[95vw] overflow-y-auto">
                {vendorList.length === 0 ? (
                  <DropdownMenuItem disabled>{t("loading")}</DropdownMenuItem>
                ) : (
                  vendorList.map((v) => (
                    <DropdownMenuItem
                      key={v.code}
                      onClick={() => {
                        update("vendor", v.code)
                        setVendorOpen(false)
                      }}
                    >
                      <span className="font-medium">{v.code}</span>
                      <span className="ml-1.5 text-muted-foreground">— {v.name}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">{t("itemsOutboundLocation")}</label>
          <Select
            value={formData.outboundLocation || "none"}
            onValueChange={(v) => update("outboundLocation", v === "none" ? "" : v)}
          >
            <SelectTrigger className="h-10 text-sm">
              <SelectValue placeholder={t("itemsOutboundLocationPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("itemsOutboundLocationNone") || "— 선택 —"}</SelectItem>
              {outboundLocations.map((loc) => (
                <SelectItem key={loc.location_code} value={loc.location_code}>
                  {loc.name || loc.location_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <label className="text-xs font-semibold text-foreground">{t("itemsUnit") || "표준 단위"}</label>
            <Select value={formData.unit || "_"} onValueChange={(v) => update("unit", v === "_" ? "" : v)}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder={t("itemsUnitPh") || "선택 (예: kg, g, 개)"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">—</SelectItem>
                {UNIT_OPTIONS.filter(Boolean).map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">{t("itemsTotalQuantity") || "총 수량"}</label>
            <Input
              type="number"
              placeholder="0"
              min="0"
              step="0.0001"
              className="h-10 text-sm text-right tabular-nums"
              value={formData.totalQuantity}
              onChange={(e) => update("totalQuantity", e.target.value)}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-1">
          {(t("itemsTotalQuantityHint") || "총 수량 있으면 1{unit}당 원가 = 판매가 ÷ 총 수량 (원가 계산기 반영)").replace("{unit}", formData.unit || "?")}
        </p>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
            {t("itemsDescription") || "설명"}
          </label>
          <Input
            placeholder={t("itemsDescriptionPh") || "신입 직원용 품목 설명"}
            className="h-10 text-sm"
            value={formData.description}
            onChange={(e) => update("description", e.target.value)}
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
            {formData.taxType === "taxable" && (
              <p className="text-[10px] text-muted-foreground">{t("itemsPriceVatExclHint")}</p>
            )}
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
        {formData.unit && parseFloat(formData.totalQuantity) > 0 && parseFloat(formData.price) >= 0 && (() => {
          const price = parseFloat(formData.price)
          const totalQty = parseFloat(formData.totalQuantity)
          const costPerStdUnit = price / totalQty
          const u = formData.unit.toLowerCase().trim()
          const isPackaging = /포장|packaging|박스|용기|봉지|pack|pouch|box|bag/.test((formData.category || "").toLowerCase())
          let costPerBaseUnit: number | null = null
          let baseUnitLabel = ""
          if (!isPackaging) {
            if (u === "kg" || u === "oz" || u === "lb") {
              if (u === "kg") { costPerBaseUnit = costPerStdUnit / 1000; baseUnitLabel = "g" }
              else if (u === "oz") { costPerBaseUnit = costPerStdUnit / 28.35; baseUnitLabel = "g" }
              else if (u === "lb") { costPerBaseUnit = costPerStdUnit / 453.6; baseUnitLabel = "g" }
            } else if (u === "l") {
              costPerBaseUnit = costPerStdUnit / 1000
              baseUnitLabel = "ml"
            }
          }
          return (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 space-y-1">
              <div>
                <span className="text-xs text-muted-foreground">
                  {t("itemsCostPerUnitPreview") || "1"}{formData.unit}
                  {t("itemsCostPerUnitPreview2") || "당 원가"}:
                </span>
                <span className="ml-2 text-sm font-semibold tabular-nums text-primary">
                  {costPerStdUnit.toFixed(4)} ฿
                </span>
              </div>
              {costPerBaseUnit != null && baseUnitLabel && (
                <div className="text-xs text-muted-foreground">
                  {t("itemsCostPerUnitConverted") || "→ 1"}{baseUnitLabel}{t("itemsCostPerUnitPreview2") || "당 원가"}:
                  <span className="ml-2 font-semibold tabular-nums text-primary">
                    {costPerBaseUnit.toFixed(4)} ฿
                  </span>
                  <span className="text-[10px] ml-1">({t("itemsCostConversionHint") || "원가 분석에 사용"})</span>
                </div>
              )}
            </div>
          )
        })()}

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
