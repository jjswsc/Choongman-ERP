"use client"
import { appAlert } from "@/lib/app-message"

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
  Plus,
  Trash2,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { getVendorsForPurchase, getItemVendors, saveItemVendors, type ItemVendorRow } from "@/lib/api-client"
const UNIT_OPTIONS = ['', 'kg', 'g', 'L', 'ml', 'ea', 'pack', 'oz', 'lb']

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
  /** 과세 품목일 때, 입력 가격이 부가세 포함인지(저장 시 공급가로 환산) */
  priceInputVatIncluded?: boolean
  cost: string
  /** 과세 품목일 때, 입력 원가가 부가세 포함인지(저장 시 공급가로 환산) */
  costInputVatIncluded?: boolean
  purchaseSource: "hq" | "store"
  /** 재고 기본 단위 (하위 호환, 저장용) */
  stockBaseUnit: string
  /** 조정/조사 시 선택 단위 (하위 호환) */
  stockUnitOptions: { unit: string; factor: number }[]
  /** 표준 단위 목록. (총 수량) [단위] = 1 규격. 재고/사용/원가에서 선택 */
  standardUnits: { unit: string; totalQuantity: number }[]
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
  const [itemVendorsOpen, setItemVendorsOpen] = React.useState(false)
  const [itemVendorsList, setItemVendorsList] = React.useState<ItemVendorRow[]>([])
  const [itemVendorsSaving, setItemVendorsSaving] = React.useState(false)

  const update = (key: keyof ItemFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  React.useEffect(() => {
    if ((vendorOpen || itemVendorsOpen) && vendorList.length === 0) {
      getVendorsForPurchase().then((list) => {
        const mapped = (list || []).map((v) => ({ code: v.code, name: v.name, address: v.address ?? '' }))
        setVendorList(mapped)
      })
    }
  }, [vendorOpen, itemVendorsOpen, vendorList.length])

  React.useEffect(() => {
    if (isEditing && formData.code && itemVendorsOpen) {
      getItemVendors(formData.code).then((list) => setItemVendorsList(list || []))
    }
  }, [isEditing, formData.code, itemVendorsOpen])

  const handleSaveItemVendors = async () => {
    if (!formData.code) return
    setItemVendorsSaving(true)
    try {
      const res = await saveItemVendors({
        itemCode: formData.code,
        vendors: itemVendorsList.map((v) => ({
          vendorCode: v.vendorCode,
          priority: v.priority,
          unitPrice: v.unitPrice,
          minOrderQty: v.minOrderQty,
          memo: v.memo,
        })),
      })
      if (res.success) await appAlert(t("vendorAlertUpdated") || t("itemsBtnSave") + " 완료")
      else await appAlert(res.message || "저장 실패")
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setItemVendorsSaving(false)
    }
  }

  const addItemVendor = (vc: string) => {
    if (!vc || itemVendorsList.some((v) => v.vendorCode === vc)) return
    setItemVendorsList((prev) => [...prev, { vendorCode: vc, priority: prev.length }])
  }

  const removeItemVendor = (vc: string) => {
    setItemVendorsList((prev) => prev.filter((v) => v.vendorCode !== vc))
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

        {isEditing && formData.code && (
          <Collapsible open={itemVendorsOpen} onOpenChange={setItemVendorsOpen} className="col-span-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-full justify-between text-left">
                <span className="text-xs font-semibold">{t("itemsVendorMulti") || "매입 거래처 (다대다)"}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${itemVendorsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground">
                  {t("itemsVendorMultiHint") || "품목을 여러 거래처에서 매입할 수 있도록 등록합니다. 본사 발주 시 거래처 선택 시 해당 품목이 표시됩니다."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {itemVendorsList.map((v) => (
                    <div key={v.vendorCode} className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-sm border">
                      <span className="font-medium">{v.vendorCode}</span>
                      <span className="text-muted-foreground">— {vendorList.find((x) => x.code === v.vendorCode)?.name || v.vendorCode}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItemVendor(v.vendorCode)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Select
                    value="_add"
                    onValueChange={(val) => {
                      if (val && val !== "_add" && val !== "_none") addItemVendor(val)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[200px] text-xs">
                      <SelectValue placeholder={t("itemsVendorAdd") || "+ 거래처 추가"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_add">{t("itemsVendorAdd") || "+ 거래처 추가"}</SelectItem>
                      {vendorList
                        .filter((x) => !itemVendorsList.some((iv) => iv.vendorCode === x.code))
                        .map((v) => (
                          <SelectItem key={v.code} value={v.code}>
                            {v.code} — {v.name}
                          </SelectItem>
                        ))}
                      {vendorList.filter((x) => !itemVendorsList.some((iv) => iv.vendorCode === x.code)).length === 0 && (
                        <SelectItem value="_none" disabled>{t("itemsVendorAllAdded") || "모두 추가됨"}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="secondary" onClick={handleSaveItemVendors} disabled={itemVendorsSaving}>
                    {itemVendorsSaving ? t("loading") : t("itemsBtnSave")}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

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

        <div className="space-y-2 col-span-2">
          <label className="text-xs font-semibold text-foreground">{t("itemsStandardUnitsSection") || "표준 단위 / 총 수량"}</label>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            {(formData.standardUnits || []).map((o, idx) => (
              <div key={idx} className="flex gap-2 items-center flex-wrap">
                <Select
                  value={(o.unit || "").trim() || "_"}
                  onValueChange={(v) => {
                    const u = v === "_" ? "" : v
                    setFormData((p) => {
                      const arr = [...(p.standardUnits || [])]
                      arr[idx] = { ...arr[idx], unit: u }
                      const next = { ...p, standardUnits: arr }
                      if (idx === 0) {
                        next.unit = u
                        if (arr[0]) next.totalQuantity = String(arr[0].totalQuantity)
                      }
                      return next
                    })
                  }}
                >
                  <SelectTrigger className="h-9 text-sm w-[100px]">
                    <SelectValue placeholder={t("itemsUnitPh") || "선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">—</SelectItem>
                    {UNIT_OPTIONS.filter(Boolean).map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground shrink-0">Total</span>
                <Input
                  type="number"
                  min="0.0001"
                  step="1"
                  placeholder="0"
                  className="h-9 text-sm w-24 text-right tabular-nums"
                  value={o.totalQuantity}
                  onChange={(e) => {
                    const n = Number(e.target.value) || 0
                    setFormData((p) => {
                      const arr = [...(p.standardUnits || [])]
                      arr[idx] = { ...arr[idx], totalQuantity: n }
                      const next = { ...p, standardUnits: arr }
                      if (idx === 0) {
                        next.totalQuantity = e.target.value
                        if (arr[0]) next.unit = arr[0].unit
                      }
                      return next
                    })
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-destructive"
                  onClick={() =>
                    setFormData((p) => {
                      const arr = (p.standardUnits || []).filter((_, i) => i !== idx)
                      const next = { ...p, standardUnits: arr }
                      if (idx === 0 && arr.length > 0) {
                        next.unit = arr[0].unit
                        next.totalQuantity = String(arr[0].totalQuantity)
                      } else if (idx === 0) {
                        next.unit = ""
                        next.totalQuantity = ""
                      }
                      return next
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={() => setFormData((p) => ({ ...p, standardUnits: [...(p.standardUnits || []), { unit: "", totalQuantity: 1 }] }))}
              >
                <Plus className="h-3 w-3" />
                {t("itemsAdd") || "추가"}
              </Button>
              {(formData.standardUnits || []).length === 0 && (
                <span className="text-[10px] text-muted-foreground italic">{t("itemsStandardUnitsEmpty") || "표준 단위 없으면 재고/사용/원가에서 규격(1개) 기준만 입력 가능"}</span>
              )}
            </div>
          </div>
        </div>

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
              <>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.priceInputVatIncluded}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFormData((prev) => {
                        const num = Number(prev.price) || 0
                        const next = { ...prev, priceInputVatIncluded: checked }
                        if (checked) next.price = String(Math.round(num * 1.07 * 100) / 100)
                        else next.price = String(Math.round((num / 1.07) * 100) / 100)
                        return next
                      })
                    }}
                    className="rounded border-input"
                  />
                  {t("itemsPriceVatIncluded")}
                </label>
                <p className="text-[10px] text-muted-foreground">
                  {formData.priceInputVatIncluded ? (t("itemsPriceVatIncludedHint") || "저장 시 공급가(부가세 제외)로 환산됩니다.") : t("itemsPriceVatExclHint")}
                </p>
              </>
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
            {formData.taxType === "taxable" && (
              <>
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.costInputVatIncluded}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFormData((prev) => {
                        const num = Number(prev.cost) || 0
                        const next = { ...prev, costInputVatIncluded: checked }
                        if (checked) next.cost = String(Math.round(num * 1.07 * 100) / 100)
                        else next.cost = String(Math.round((num / 1.07) * 100) / 100)
                        return next
                      })
                    }}
                    className="rounded border-input"
                  />
                  {t("itemsCostVatIncluded")}
                </label>
                <p className="text-[10px] text-muted-foreground">
                  {formData.costInputVatIncluded ? (t("itemsCostVatIncludedHint") || "저장 시 공급가(부가세 제외)로 환산됩니다.") : (t("itemsCostVatExclHint") || "원가는 부가세 제외 기준.")}
                </p>
              </>
            )}
          </div>
        </div>
        {formData.unit && (() => {
          const u = formData.unit.toLowerCase().trim()
          const price = parseFloat(formData.price) || 0
          const cost = parseFloat(formData.cost) || 0
          const totalQty = parseFloat(formData.totalQuantity) || 0

          const isPackaging = /포장|packaging|박스|용기|봉지|pack|pouch|box|bag/.test((formData.category || "").toLowerCase())

          let costPerStdUnit: number | null = null
          if (totalQty > 0 && (price >= 0 || cost >= 0)) {
            const baseVal = price > 0 ? price : cost
            costPerStdUnit = baseVal / totalQty
          } else if ((u === "g" || u === "ml") && cost >= 0) {
            costPerStdUnit = cost
          }

          if (costPerStdUnit == null) return null

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
            } else if (u === "g" || u === "ml") {
              costPerBaseUnit = costPerStdUnit
              baseUnitLabel = u
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
              {costPerBaseUnit != null && baseUnitLabel && u !== baseUnitLabel && (
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
