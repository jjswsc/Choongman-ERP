"use client"

import { useState, useRef, useEffect, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
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
import { UtensilsCrossed, ChefHat, Package, Search, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MenuItem } from "@/lib/cost-data"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import { mainCategoryMatches } from "@/lib/pos-menu-categories"

interface MenuInfoPanelProps {
  menuItem: MenuItem
  onMenuItemChange: (item: MenuItem) => void
  /** 카테고리 목록 (메뉴 관리에서 사용 중인 값) */
  categories?: string[]
  /** 대분류 목록 */
  mainCategories?: string[]
  /** POS 메뉴 목록 (검색·선택용) */
  menuRows?: PosMenuCostAnalysisRow[]
  /** 메뉴 선택 시 (원가 계산기에서 목록 로드) */
  onMenuSelect?: (row: PosMenuCostAnalysisRow) => void
  /** 메뉴 변경 요청 시 (다시 검색 가능하도록) */
  onRequestChangeMenu?: () => void
  /** 코드·카테고리·메뉴명 읽기 전용 (pos 메뉴 관리와 연동) */
  readOnlyMenuInfo?: boolean
  /** 현재 메뉴 ID (조리 시간 저장 시 사용, 목록에서 선택된 메뉴) */
  menuId?: string
  /** 조리 시간 변경 시 DB 저장 콜백 (menuId, cookingTimeMin) */
  onSaveCookingTime?: (menuId: string, cookingTimeMin: number | null) => void
}

export function MenuInfoPanel({ menuItem, onMenuItemChange, categories = [], mainCategories = [], menuRows = [], onMenuSelect, onRequestChangeMenu, readOnlyMenuInfo = false, menuId, onSaveCookingTime }: MenuInfoPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const categoryOptions = categories.length > 0 ? categories : ["Size S", "Size M", "Size L", "Set"]
  const [menuSearchOpen, setMenuSearchOpen] = useState(false)
  const [menuCodeSearch, setMenuCodeSearch] = useState("")
  const [menuNameSearch, setMenuNameSearch] = useState("")
  const menuSearchRef = useRef<HTMLDivElement>(null)
  const menuSearchAnchorRef = useRef<HTMLDivElement>(null)
  const menuDropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const menuFilteredByCat = menuRows.filter((r) => {
    if (menuItem.categoryMain && !mainCategoryMatches(menuItem.categoryMain, r.categoryMain, r.menuCode)) return false
    if (menuItem.category) {
      const a = (r.category ?? "").trim().toLowerCase()
      const b = menuItem.category.trim().toLowerCase()
      if (a !== b) return false
    }
    return true
  })
  const menuFiltered = menuFilteredByCat.filter((r) => {
    const codeTerm = menuCodeSearch.trim().toLowerCase()
    const nameTerm = menuNameSearch.trim().toLowerCase()
    const displayCode = (r as PosMenuCostAnalysisRow & { displayCode?: string }).displayCode ?? r.menuCode
    return (
      (displayCode || "").toLowerCase().includes(codeTerm) ||
      (r.menuCode || "").toLowerCase().includes(codeTerm) ||
      (r.menuName || "").toLowerCase().includes(nameTerm) ||
      (r.optionName || "").toLowerCase().includes(nameTerm)
    )
  })

  useLayoutEffect(() => {
    if (!menuSearchOpen || !menuSearchAnchorRef.current) {
      setDropdownRect(null)
      return
    }
    const rect = menuSearchAnchorRef.current.getBoundingClientRect()
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [menuSearchOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        menuSearchRef.current?.contains(target) ||
        menuDropdownRef.current?.contains(target)
      ) return
      setMenuSearchOpen(false)
    }
    if (menuSearchOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuSearchOpen])

  const handleMenuSelect = (row: PosMenuCostAnalysisRow) => {
    onMenuSelect?.(row)
    setMenuSearchOpen(false)
    setMenuCodeSearch("")
    setMenuNameSearch("")
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
        <div className="flex flex-wrap gap-x-4 gap-y-4 items-end col-span-2 md:col-span-4 w-full">
          {mainCategories.length > 0 && (
            <div className="space-y-1.5 w-[20%] min-w-[56px] shrink-0">
              <Label htmlFor="categoryMain" className="text-xs text-muted-foreground block">
                {t("posMenuCategoryMain")}
              </Label>
              {readOnlyMenuInfo ? (
                <div className="h-9 min-h-[36px] px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
                  {menuItem.categoryMain || "—"}
                </div>
              ) : (
                <Select
                  value={menuItem.categoryMain || "_all"}
                  onValueChange={(val) => onMenuItemChange({ ...menuItem, categoryMain: val === "_all" ? "" : val })}
                >
                  <SelectTrigger className="h-9 min-h-[36px] bg-secondary/50 border-border">
                    <SelectValue placeholder={t("posMenuCategoryAll") || "전체"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
                    {mainCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="space-y-1.5 min-w-[173px] max-w-[230px]">
            <Label htmlFor="category" className="text-xs text-muted-foreground block">
              {t("posMenuCategory")}
            </Label>
            {readOnlyMenuInfo ? (
              <div className="h-9 min-h-[36px] px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
                {menuItem.category || "—"}
              </div>
            ) : (
              <Select
                value={menuItem.category || "_all"}
                onValueChange={(val) => onMenuItemChange({ ...menuItem, category: val === "_all" ? "" : val })}
              >
                <SelectTrigger className="h-9 min-h-[36px] bg-secondary/50 border-border">
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
          <div className="space-y-1.5 shrink-0">
            <Label className="text-xs text-muted-foreground block">
              {t("posMenuCookingTimeMin") || "조리 시간"}
            </Label>
            <div className="flex items-center gap-1">
              <Input
                id="cookingTimeMin"
                type="number"
                min={0}
                max={999}
                placeholder={t("posMenuMin") || "분"}
                value={menuItem.cookingTimeMin != null ? Math.floor(menuItem.cookingTimeMin) : ""}
                onChange={(e) => {
                  const minVal = e.target.value === "" ? 0 : (parseInt(e.target.value, 10) || 0)
                  const sec = Math.round(((menuItem.cookingTimeMin ?? 0) % 1) * 60)
                  const v = minVal + sec / 60
                  onMenuItemChange({ ...menuItem, cookingTimeMin: v })
                }}
                onBlur={() => {
                  if (onSaveCookingTime && readOnlyMenuInfo && menuId) {
                    const total = menuItem.cookingTimeMin != null ? Math.round((menuItem.cookingTimeMin ?? 0) * 60) / 60 : null
                    onSaveCookingTime(menuId, total)
                  }
                }}
                className="h-9 min-h-[36px] w-14 font-mono bg-secondary/50 border-border [& input]:text-right"
              />
              <span className="text-sm text-muted-foreground">{t("posMenuMin") || "분"}</span>
              <Input
                id="cookingTimeSec"
                type="number"
                min={0}
                max={59}
                placeholder="초"
                value={menuItem.cookingTimeMin != null ? Math.round(((menuItem.cookingTimeMin ?? 0) % 1) * 60) : ""}
                onChange={(e) => {
                  const secVal = e.target.value === "" ? 0 : Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0))
                  const min = Math.floor(menuItem.cookingTimeMin ?? 0)
                  const v = min + secVal / 60
                  onMenuItemChange({ ...menuItem, cookingTimeMin: v })
                }}
                onBlur={() => {
                  if (onSaveCookingTime && readOnlyMenuInfo && menuId) {
                    const total = menuItem.cookingTimeMin != null ? Math.round((menuItem.cookingTimeMin ?? 0) * 60) / 60 : null
                    onSaveCookingTime(menuId, total)
                  }
                }}
                className="h-9 min-h-[36px] w-14 font-mono bg-secondary/50 border-border [& input]:text-right"
              />
              <span className="text-sm text-muted-foreground">{t("posMenuSec") || "초"}</span>
            </div>
          </div>
          <div className="space-y-1.5 shrink-0 ml-auto">
            <Label htmlFor="inclVat" className="text-xs font-medium text-foreground block">
              {t("posCostPriceInVat") || "가격(In VAT)"}
            </Label>
            <Input
              id="inclVat"
              type="number"
              value={menuItem.inclVat}
              onChange={(e) => {
                const v = parseFloat(e.target.value) || 0
                onMenuItemChange({
                  ...menuItem,
                  inclVat: v,
                  priceHall: v,
                  priceDelivery: menuItem.priceDelivery ?? v,
                })
              }}
              className="h-10 min-h-[40px] w-28 font-mono text-base font-semibold bg-primary/5 border-2 border-primary/30 text-primary [& input]:text-right"
              step="0.01"
            />
          </div>
        </div>

        <div className="col-span-2 md:col-span-4" ref={menuSearchRef}>
          {readOnlyMenuInfo && menuRows.length > 0 && onMenuSelect && onRequestChangeMenu ? (
            <div className="flex items-end gap-2">
              <div className="space-y-1.5 w-[30%] min-w-[70px] shrink-0">
                <Label className="text-xs text-muted-foreground">{t("posMenuCode") || "코드"}</Label>
                <div className="h-9 px-3 flex items-center text-sm font-mono bg-muted/30 rounded-md border border-border">
                  {menuItem.menuCode || "—"}
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("posMenuName") || "메뉴명"}</Label>
                <div className="h-9 px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
                  {menuItem.menuName || "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={onRequestChangeMenu}
                className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 hover:bg-muted text-xs font-medium shrink-0 self-end"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("posCostChangeMenu") || "메뉴 변경"}
              </button>
            </div>
          ) : readOnlyMenuInfo ? (
            <div className="flex items-end gap-2">
              <div className="space-y-1.5 w-[30%] min-w-[70px] shrink-0">
                <Label className="text-xs text-muted-foreground">{t("posMenuCode") || "코드"}</Label>
                <div className="h-9 px-3 flex items-center text-sm font-mono bg-muted/30 rounded-md border border-border">
                  {menuItem.menuCode || "—"}
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t("posMenuName") || "메뉴명"}</Label>
                <div className="h-9 px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
                  {menuItem.menuName || "—"}
                </div>
              </div>
            </div>
          ) : menuRows.length > 0 && onMenuSelect ? (
            <div ref={menuSearchAnchorRef} className="relative flex items-end gap-2">
              <div className="space-y-1.5 w-[30%] min-w-[70px] shrink-0">
                <Label className="text-xs text-muted-foreground">{t("posMenuCode") || "코드"}</Label>
                <Input
                  value={menuCodeSearch}
                  onChange={(e) => setMenuCodeSearch(e.target.value)}
                  onFocus={() => setMenuSearchOpen(true)}
                  placeholder=""
                  className="h-9 pl-2 pr-2 font-mono text-xs bg-secondary/50 border-border"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5" onFocus={() => setMenuSearchOpen(true)}>
                <Label className="text-xs text-muted-foreground">{t("posMenuName") || "메뉴명"}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10 pointer-events-none" />
                  <Input
                    value={menuNameSearch}
                    onChange={(e) => setMenuNameSearch(e.target.value)}
                    onFocus={() => setMenuSearchOpen(true)}
                    placeholder=""
                    className="h-9 pl-8 bg-secondary/50 border-border"
                  />
                </div>
              {typeof document !== "undefined" &&
                menuSearchOpen &&
                dropdownRect &&
                createPortal(
                  <div
                    ref={menuDropdownRef}
                    className="fixed z-[9999] min-h-[240px] max-h-[400px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg py-1"
                    style={{
                      top: dropdownRect.top,
                      left: dropdownRect.left,
                      width: dropdownRect.width,
                    }}
                  >
                    {menuFiltered.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                        {menuItem.categoryMain || menuItem.category
                          ? (t("posCostNoMenuInCategory") || "해당 카테고리에 메뉴가 없습니다")
                          : (t("posCostNoIngredientsFound") || "검색 결과가 없습니다")}
                      </div>
                    ) : (
                      menuFiltered.slice(0, 50).map((r) => (
                        <button
                          key={r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId}
                          type="button"
                          className="w-full px-4 py-2 text-left text-sm hover:bg-muted/80 flex items-center gap-3"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleMenuSelect(r)
                          }}
                        >
                          <span className="font-mono text-muted-foreground shrink-0 w-20">{(r as PosMenuCostAnalysisRow & { displayCode?: string }).displayCode ?? r.menuCode}</span>
                          <span className="truncate">
                            {r.menuName}{r.optionName ? ` (${r.optionName})` : ""}
                          </span>
                          <span className="ml-auto font-mono text-xs text-primary shrink-0">
                            {(r.priceDelivery ?? r.priceHall ?? 0).toFixed(0)} ฿
                          </span>
                        </button>
                      ))
                    )}
                  </div>,
                  document.body
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("posMenuCode")} / {t("posMenuName")}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="menuCode"
                  type="text"
                  value={menuItem.menuCode}
                  onChange={(e) =>
                    onMenuItemChange({ ...menuItem, menuCode: e.target.value })
                  }
                  placeholder={t("posMenuCode")}
                  className="h-9 w-[30%] min-w-[70px] font-mono bg-secondary/50 border-border shrink-0"
                />
                <Input
                  id="menuName"
                  value={menuItem.menuName}
                  onChange={(e) =>
                    onMenuItemChange({ ...menuItem, menuName: e.target.value })
                  }
                  className="h-9 flex-1 bg-secondary/50 border-border"
                  placeholder={t("posMenuName")}
                />
              </div>
            </div>
          )}
        </div>

        <div className="col-span-2 md:col-span-4 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="space-y-1.5 flex-1 min-w-0">
            <Label htmlFor="description" className="text-xs text-muted-foreground">
              {t("posCostDescription")}
            </Label>
            <Input
              id="description"
              value={menuItem.description}
              onChange={(e) =>
                onMenuItemChange({ ...menuItem, description: e.target.value })
              }
              className="h-9 bg-secondary/50 border-border w-full"
            />
          </div>
          <div className="space-y-1.5 shrink-0">
            <Label className="text-xs text-muted-foreground">
              {t("posCostServiceType")}
            </Label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onMenuItemChange({
                    ...menuItem,
                    serviceType: "Dine-In",
                    inclVat: menuItem.priceHall ?? menuItem.inclVat ?? 0,
                  })
                }
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 h-9 min-w-[5.5rem] px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  menuItem.serviceType === "Dine-In"
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
                )}
              >
                <ChefHat className="h-3.5 w-3.5 shrink-0" />
                <span>{t("posCostDineIn")}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onMenuItemChange({
                    ...menuItem,
                    serviceType: "Delivery",
                    inclVat: menuItem.priceDelivery ?? menuItem.priceHall ?? menuItem.inclVat ?? 0,
                  })
                }
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 h-9 min-w-[5.5rem] px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                  menuItem.serviceType === "Delivery"
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-muted/50 text-muted-foreground border border-border hover:bg-muted"
                )}
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span>{t("posCostDelivery")}</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
