"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UtensilsCrossed, ChefHat, Truck, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MenuItem } from "@/lib/cost-data"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"

interface MenuInfoPanelProps {
  menuItem: MenuItem
  onMenuItemChange: (item: MenuItem) => void
  /** 카테고리 목록 (메뉴 관리에서 사용 중인 값) */
  categories?: string[]
  /** POS 메뉴 목록 (검색·선택용) */
  menuRows?: PosMenuCostAnalysisRow[]
  /** 메뉴 선택 시 (원가 계산기에서 목록 로드) */
  onMenuSelect?: (row: PosMenuCostAnalysisRow) => void
  /** 코드·카테고리·메뉴명 읽기 전용 (pos 메뉴 관리와 연동) */
  readOnlyMenuInfo?: boolean
}

export function MenuInfoPanel({ menuItem, onMenuItemChange, categories = [], menuRows = [], onMenuSelect, readOnlyMenuInfo = false }: MenuInfoPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const categoryOptions = categories.length > 0 ? categories : ["Size S", "Size M", "Size L", "Set"]
  const [menuSearchOpen, setMenuSearchOpen] = useState(false)
  const [menuSearchTerm, setMenuSearchTerm] = useState("")
  const menuSearchRef = useRef<HTMLDivElement>(null)

  const menuFilteredByCat = menuRows.filter((r) => !menuItem.category || r.category === menuItem.category)
  const menuFiltered = menuFilteredByCat.filter((r) => {
    if (!menuSearchTerm.trim()) return true
    const term = menuSearchTerm.toLowerCase()
    return (
      (r.menuCode || "").toLowerCase().includes(term) ||
      (r.menuName || "").toLowerCase().includes(term) ||
      (r.optionName || "").toLowerCase().includes(term)
    )
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuSearchRef.current && !menuSearchRef.current.contains(e.target as Node)) {
        setMenuSearchOpen(false)
      }
    }
    if (menuSearchOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuSearchOpen])

  const handleMenuSelect = (row: PosMenuCostAnalysisRow) => {
    onMenuSelect?.(row)
    setMenuSearchOpen(false)
    setMenuSearchTerm("")
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <UtensilsCrossed className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{t("posCostMenuItemDetails")}</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-xs text-muted-foreground">
            {t("posMenuCategory")}
          </Label>
          {readOnlyMenuInfo ? (
            <div className="h-9 px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
              {menuItem.category || "—"}
            </div>
          ) : (
            <Select
              value={menuItem.category || "_all"}
              onValueChange={(val) => onMenuItemChange({ ...menuItem, category: val === "_all" ? "" : val })}
            >
              <SelectTrigger className="h-9 bg-secondary/50 border-border">
                <SelectValue placeholder={t("posMenuCategoryAll") || "전체"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5 col-span-2 md:col-span-3" ref={menuSearchRef}>
          <Label className="text-xs text-muted-foreground">
            {t("posMenuCode")} / {t("posMenuName")}
          </Label>
          {readOnlyMenuInfo ? (
            <div className="h-9 px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
              {menuItem.menuCode ? `${menuItem.menuCode} — ${menuItem.menuName || ""}` : (menuItem.menuName || "—")}
            </div>
          ) : menuRows.length > 0 && onMenuSelect ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
              <Input
                value={menuSearchTerm}
                onChange={(e) => setMenuSearchTerm(e.target.value)}
                onFocus={() => setMenuSearchOpen(true)}
                placeholder={t("posCostSearchMenuPh") || "카테고리 선택 후 코드·메뉴명 검색"}
                className="h-9 pl-8 bg-secondary/50 border-border"
              />
              {menuSearchOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[240px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1">
                  {menuFiltered.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      {t("posCostNoIngredientsFound") || "검색 결과가 없습니다"}
                    </div>
                  ) : (
                    menuFiltered.slice(0, 50).map((r) => (
                      <button
                        key={r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId}
                        type="button"
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/80 flex items-center gap-3"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleMenuSelect(r)
                        }}
                      >
                        <span className="font-mono text-muted-foreground shrink-0 w-16">{r.menuCode}</span>
                        <span className="truncate">
                          {r.menuName}{r.optionName ? ` (${r.optionName})` : ""}
                        </span>
                        <span className="ml-auto font-mono text-xs text-primary shrink-0">
                          {(r.priceDelivery ?? r.priceHall ?? 0).toFixed(0)} ฿
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <Input
                id="menuCode"
                type="text"
                value={menuItem.menuCode}
                onChange={(e) =>
                  onMenuItemChange({ ...menuItem, menuCode: e.target.value })
                }
                placeholder={t("posMenuCode")}
                className="h-9 font-mono bg-secondary/50 border-border"
              />
              <Input
                id="menuName"
                value={menuItem.menuName}
                onChange={(e) =>
                  onMenuItemChange({ ...menuItem, menuName: e.target.value })
                }
                className="h-9 bg-secondary/50 border-border mt-1"
                placeholder={t("posMenuName")}
              />
            </>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            {t("posCostDescription")}
          </Label>
          <Input
            id="description"
            value={menuItem.description}
            onChange={(e) =>
              onMenuItemChange({ ...menuItem, description: e.target.value })
            }
            className="h-9 bg-secondary/50 border-border"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inclVat" className="text-xs text-muted-foreground">
            {t("posCostInclVatThb")}
          </Label>
          <Input
            id="inclVat"
            type="number"
            value={menuItem.inclVat}
            onChange={(e) =>
              onMenuItemChange({
                ...menuItem,
                inclVat: parseFloat(e.target.value) || 0,
              })
            }
            className="h-9 font-mono bg-secondary/50 border-border text-primary font-semibold"
            step="0.01"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            {t("posCostServiceType")}
          </Label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onMenuItemChange({ ...menuItem, serviceType: "Dine-In" })}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium transition-colors",
                menuItem.serviceType === "Dine-In"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
              )}
            >
              <ChefHat className="h-3.5 w-3.5" />
              {t("posCostDineIn")}
            </button>
            <button
              type="button"
              onClick={() => onMenuItemChange({ ...menuItem, serviceType: "Delivery" })}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-medium transition-colors",
                menuItem.serviceType === "Delivery"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
              )}
            >
              <Truck className="h-3.5 w-3.5" />
              {t("posCostDelivery")}
            </button>
          </div>
        </div>

        {menuItem.serviceType === "Delivery" && (
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="appFeePercent" className="text-xs text-muted-foreground">
              {t("posCostAppFeePercent")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="appFeePercent"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={menuItem.deliveryPercent}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (!Number.isNaN(v) && v >= 0 && v <= 100) {
                    onMenuItemChange({ ...menuItem, deliveryPercent: v })
                  } else if (e.target.value === "" || e.target.value === "-") {
                    onMenuItemChange({ ...menuItem, deliveryPercent: 0 })
                  }
                }}
                className="h-9 w-20 font-mono bg-secondary/50 border-border text-right"
                placeholder="25"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t("posCostAppFeePercentHint")}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
