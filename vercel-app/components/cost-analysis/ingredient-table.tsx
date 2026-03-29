"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
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
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Trash2, Search, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecipeItem } from "@/lib/cost-data"
import { getIngredient, calculateItemCost, getRuntimeIngredients, getRuntimeSauces, getRuntimeApiItems, getIngredientItemCode, getIngredientStandardUnits, getBahtPerStandardUnit, getQuantityFactorToStore, getQuantityFactorToDisplay, MISE_DEFAULT } from "@/lib/cost-data"

type IngredientSource = "api" | "ingredient" | "sauce"

interface IngredientWithSource {
  code: number
  name: string
  source: IngredientSource
}

interface IngredientPickerProps {
  value: number
  onChange: (code: number) => void
  ingredients: IngredientWithSource[]
  openRowIndex: number | null
  rowIndex: number
  onOpenChange: (index: number | null) => void
  t: (key: string) => string
}

function IngredientPicker({
  value,
  onChange,
  ingredients,
  openRowIndex,
  rowIndex,
  onOpenChange,
  t,
}: IngredientPickerProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isOpen = openRowIndex === rowIndex

  const categories = [
    { value: "all", label: t("posMenuCategoryAll") || "전체" },
    { value: "api", label: t("posCostCategoryItems") || "품목관리" },
    { value: "ingredient", label: t("posCostCategoryIngredient") || "재료" },
    { value: "sauce", label: t("posCostCategorySauce") || "소스" },
  ]

  const filtered = ingredients.filter((ing) => {
    const itemCode = getIngredientItemCode(ing.code) ?? String(ing.code)
    const matchSearch =
      !searchTerm ||
      ing.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itemCode.toLowerCase().includes(searchTerm.toLowerCase())
    const matchCat = categoryFilter === "all" || ing.source === categoryFilter
    return matchSearch && matchCat
  })

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("")
      setCategoryFilter("all")
    }
  }, [isOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onOpenChange(null)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onOpenChange])

  const currentIng = ingredients.find((i) => i.code === value)
  const fallbackIng = getIngredient(value)
  const displayLabel = currentIng?.name ?? fallbackIng?.name ?? "-"

  return (
    <div ref={wrapperRef} className="relative min-w-[180px]">
      <button
        type="button"
        onClick={() => onOpenChange(isOpen ? null : rowIndex)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1 rounded-md border border-transparent bg-transparent px-2 text-left text-sm hover:bg-secondary/50 focus:ring-1 focus:ring-primary/30",
          isOpen && "ring-1 ring-primary/30"
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[280px] max-h-[320px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md flex flex-col">
          <div className="p-2 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-8 pr-2 text-xs"
                placeholder={t("posCostSearchIngredientPh") || "이름 또는 코드 검색..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-y-auto max-h-[220px] py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {t("posCostNoIngredientsFound") || "검색 결과가 없습니다"}
              </div>
            ) : (
              filtered.map((ing) => {
                const itemCode = getIngredientItemCode(ing.code) ?? String(ing.code)
                return (
                  <button
                    key={ing.code}
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-muted/80",
                      ing.code === value && "bg-primary/10 text-primary"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onChange(ing.code)
                      onOpenChange(null)
                    }}
                  >
                    <span className="font-mono text-muted-foreground shrink-0 w-12">{itemCode}</span>
                    <span className="truncate">{ing.name}</span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface IngredientTableProps {
  title: string
  type: "food" | "packaging"
  items: RecipeItem[]
  onItemsChange: (items: RecipeItem[]) => void
  /** 재료 추가 다이얼로그에 소스 포함 (소스 원가 탭용) */
  addDialogIncludeSauces?: boolean
  /** 표준단위 필수 여부. false면 표준단위 없는 품목도 추가 가능 */
  addDialogRequireStandardUnits?: boolean
  /** usedRuntimeCodes 대신 사용할 제외 코드 집합 (소스 탭: 폼 내 재료만 제외) */
  excludeCodes?: Set<number>
  /** true면 ฿/단위·원가 텍스트를 검정색으로 표시 (소스 원가용) */
  costTextDark?: boolean
}

export function IngredientTable({
  title,
  type,
  items,
  onItemsChange,
  addDialogIncludeSauces = false,
  addDialogRequireStandardUnits = true,
  excludeCodes,
  costTextDark = false,
}: IngredientTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [openPickerRow, setOpenPickerRow] = useState<number | null>(null)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addSauceDialogOpen, setAddSauceDialogOpen] = useState(false)
  const [addSearchTerm, setAddSearchTerm] = useState("")
  const [addCategoryFilter, setAddCategoryFilter] = useState<string>("all")
  /** 행별 입력 단위. "spec" = 규격 1개, "unit::totalQty" = 표준 단위 (입력÷totalQty = 규격) */
  const [rowUnitKeys, setRowUnitKeys] = useState<Record<number, string>>({})

  const runtimeByType = getRuntimeIngredients().filter((i) => i.category === type)
  const sauceIngs = type === "food" ? getRuntimeSauces() : []
  const apiItemsByType = getRuntimeApiItems().filter((i) => i.category === type)
  /** 재료 추가 다이얼로그: 음식·포장 모두 전체 카테고리(food + packaging) 선택 가능 */
  const apiItemsForAddDialog = getRuntimeApiItems().filter((i) => i.category === "food" || i.category === "packaging")
  const usedRuntimeCodes = excludeCodes ?? new Set(runtimeByType.map((i) => i.code))
  const availableIngredients: IngredientWithSource[] = [
    ...apiItemsByType.filter((i) => !usedRuntimeCodes.has(i.code)).map((i) => ({ ...i, source: "api" as const })),
    ...runtimeByType.map((i) => ({ ...i, source: "ingredient" as const })),
    ...sauceIngs.map((i) => ({ ...i, source: "sauce" as const })),
  ]
  /** 재료 추가 팝업: 품목 관리 + (옵션) 소스 */
  const addDialogItemsOnly = useMemo(() => {
    const apiFiltered = apiItemsForAddDialog
      .filter((i) => !usedRuntimeCodes.has(i.code))
      .filter((i) => addDialogRequireStandardUnits ? (i.standardUnits?.length ?? 0) > 0 : true)
      .map((i) => ({ ...i, source: "api" as const }))
    const sauceFiltered = addDialogIncludeSauces && type === "food"
      ? sauceIngs.filter((i) => !usedRuntimeCodes.has(i.code)).map((i) => ({ ...i, source: "sauce" as const, categoryRaw: t("posCostCategorySauce") || "소스" }))
      : []
    return [...apiFiltered, ...sauceFiltered]
  }, [apiItemsForAddDialog, sauceIngs, usedRuntimeCodes, addDialogIncludeSauces, addDialogRequireStandardUnits, type, t])
  /** 품목 관리 카테고리 목록 (추가 다이얼로그 필터용) - 품목의 categoryRaw만 사용 */
  const itemCategories = useMemo(() => {
    const set = new Set(
      apiItemsForAddDialog
        .map((i) => i.categoryRaw)
        .filter((c): c is string => typeof c === "string" && c.length > 0)
    )
    if (addDialogIncludeSauces && type === "food" && sauceIngs.length > 0) {
      set.add(t("posCostCategorySauce") || "소스")
    }
    return Array.from(set).sort()
  }, [apiItemsForAddDialog, addDialogIncludeSauces, type, sauceIngs.length, t])

  const updateQuantity = useCallback(
    (index: number, quantity: number) => {
      const updated = [...items]
      updated[index] = { ...updated[index], quantity }
      onItemsChange(updated)
    },
    [items, onItemsChange]
  )

  const getRowDisplayQuantity = useCallback(
    (index: number, quantity: number) => {
      const key = rowUnitKeys[index] ?? "spec"
      const code = items[index]?.ingredientCode
      if (!code) return quantity
      if (!key || key === "spec") return quantity
      const factor = getQuantityFactorToDisplay(code, key)
      return quantity / factor
    },
    [rowUnitKeys, items]
  )

  const setRowQuantityFromDisplay = useCallback(
    (index: number, displayValue: number) => {
      const key = rowUnitKeys[index] ?? "spec"
      const code = items[index]?.ingredientCode
      if (!code) return
      if (!key || key === "spec") {
        updateQuantity(index, displayValue)
        return
      }
      const factor = getQuantityFactorToStore(code, key)
      updateQuantity(index, displayValue * factor)
    },
    [rowUnitKeys, items, updateQuantity]
  )

  const updateMisePercent = useCallback(
    (index: number, misePercent: number) => {
      const updated = [...items]
      updated[index] = { ...updated[index], misePercent }
      onItemsChange(updated)
    },
    [items, onItemsChange]
  )

  const usedCodes = new Set(items.map((i) => i.ingredientCode))
  const addDialogFiltered = addDialogItemsOnly.filter((ing) => {
    const itemCode = getIngredientItemCode(ing.code) ?? String(ing.code)
    const matchSearch =
      !addSearchTerm ||
      ing.name.toLowerCase().includes(addSearchTerm.toLowerCase()) ||
      itemCode.toLowerCase().includes(addSearchTerm.toLowerCase())
    const matchCat =
      addCategoryFilter === "all" ||
      (ing.categoryRaw && ing.categoryRaw.toLowerCase() === addCategoryFilter.toLowerCase())
    return matchSearch && matchCat && !usedCodes.has(ing.code)
  })

  /** 소스 클릭 시 즉시 테이블에 추가 (기본 10g) */
  const addSauceImmediately = useCallback(
    (code: number) => {
      const newIndex = items.length
      onItemsChange([...items, { ingredientCode: code, quantity: 10, misePercent: MISE_DEFAULT }])
      setRowUnitKeys((prev) => ({ ...prev, [newIndex]: "spec" }))
      setAddSauceDialogOpen(false)
    },
    [items, onItemsChange]
  )

  /** 품목 클릭 시 즉시 테이블에 추가 (단위/수량은 테이블에서 입력) */
  const addItemImmediately = useCallback(
    (code: number) => {
      const standardUnits = getIngredientStandardUnits(code)
      const unitKey = standardUnits?.length
        ? `${standardUnits[0].unit}::${standardUnits[0].totalQuantity}`
        : "spec"
      const factor = getQuantityFactorToStore(code, unitKey)
      const quantity = factor > 0 ? factor : 0
      const newIndex = items.length
      onItemsChange([...items, { ingredientCode: code, quantity, misePercent: MISE_DEFAULT }])
      setRowUnitKeys((prev) => ({ ...prev, [newIndex]: unitKey }))
      setAddDialogOpen(false)
      setAddSearchTerm("")
    },
    [items, onItemsChange]
  )

  const openAddDialog = useCallback(() => {
    setAddSearchTerm("")
    setAddCategoryFilter("all")
    setAddDialogOpen(true)
  }, [])

  useEffect(() => {
    setRowUnitKeys((prev) => {
      let changed = false
      const next = { ...prev }
      items.forEach((item, i) => {
        const units = getIngredientStandardUnits(item.ingredientCode)
        const key = prev[i] ?? "spec"
        if (units?.length && key === "spec") {
          next[i] = `${units[0].unit}::${units[0].totalQuantity}`
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [items])

  const removeItem = useCallback(
    (index: number) => {
      onItemsChange(items.filter((_, i) => i !== index))
    },
    [items, onItemsChange]
  )

  const changeIngredient = useCallback(
    (index: number, code: number) => {
      const updated = [...items]
      updated[index] = { ...updated[index], ingredientCode: code, savedItemCode: undefined }
      onItemsChange(updated)
    },
    [items, onItemsChange]
  )

  const subTotal = items.reduce((sum, item) => sum + calculateItemCost(item), 0)

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              type === "food" ? "bg-primary" : "bg-accent"
            )}
          />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-mono text-muted-foreground">
            {items.length}{t("posCostItemsCount")}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={openAddDialog}
            className="h-8 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("posCostAddItem")}
          </Button>
          {type === "food" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddSauceDialogOpen(true)}
              className="h-8 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("posCostAddSauce") || "소스 추가"}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-center text-xs font-medium text-muted-foreground">
                {t("posMenuCode")}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground min-w-[200px]">
                {t("posCostIngredient")}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground w-28">
                {t("itemsCategory")}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground">
                {t("posCostBahtPerUnit")}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground w-24">
                {t("posCostUnit") || "단위"}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground w-24">
                {type === "food" ? (t("posCostQtyG") || "수량 (g)") : (t("posCostQty") || "수량")}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground w-20">
                {t("posCostMise")}
              </TableHead>
              <TableHead className="text-center text-xs font-medium text-muted-foreground">
                {t("posCostCostThb")}
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const ingredient = getIngredient(item.ingredientCode)
              const cost = calculateItemCost(item)
              const isHovered = hoveredRow === index

              return (
                <TableRow
                  key={`${item.ingredientCode}-${index}`}
                  className={cn(
                    "border-border transition-colors",
                    isHovered && "bg-secondary/50"
                  )}
                  onMouseEnter={() => setHoveredRow(index)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {getIngredientItemCode(item.ingredientCode) ?? ingredient?.code ?? "-"}
                  </TableCell>
                  <TableCell>
                    <IngredientPicker
                      value={item.ingredientCode}
                      onChange={(code) => changeIngredient(index, code)}
                      ingredients={availableIngredients}
                      openRowIndex={openPickerRow}
                      rowIndex={index}
                      onOpenChange={setOpenPickerRow}
                      t={t}
                    />
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {getRuntimeApiItems().find((i) => i.code === item.ingredientCode)?.categoryRaw ?? "—"}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono text-sm", costTextDark ? "text-foreground" : "text-muted-foreground")}>
                    {(() => {
                      const unitKey = rowUnitKeys[index] ?? "spec"
                      const stdBaht = unitKey && unitKey !== "spec" ? getBahtPerStandardUnit(item.ingredientCode, unitKey) : undefined
                      const val = stdBaht ?? ingredient?.bahtPerUnit
                      return val != null ? val.toFixed(3) : "-"
                    })()}
                  </TableCell>
                  <TableCell className="text-center">
                    {(() => {
                      const standardUnits = getIngredientStandardUnits(item.ingredientCode)
                      const hasUnits = standardUnits && standardUnits.length > 0
                      const unitKey = rowUnitKeys[index] ?? "spec"
                      return hasUnits ? (
                        <Select
                          value={unitKey}
                          onValueChange={(v) => setRowUnitKeys((prev) => ({ ...prev, [index]: v }))}
                        >
                          <SelectTrigger className="h-8 w-full min-w-[72px] text-[11px] border-dashed">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {standardUnits!.map((o) => (
                              <SelectItem key={`${o.unit}::${o.totalQuantity}`} value={`${o.unit}::${o.totalQuantity}`}>
                                {o.unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">g</span>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      const standardUnits = getIngredientStandardUnits(item.ingredientCode)
                      const hasUnits = standardUnits && standardUnits.length > 0
                      const displayQty = getRowDisplayQuantity(index, item.quantity)
                      return (
                        <Input
                          type="number"
                          value={hasUnits ? displayQty : item.quantity}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0
                            if (hasUnits) setRowQuantityFromDisplay(index, v)
                            else updateQuantity(index, v)
                          }}
                          className="h-8 w-full min-w-[80px] ml-auto text-right font-mono text-sm bg-secondary/50 border-border focus:border-primary focus:ring-1 focus:ring-primary/30"
                          step="1"
                          min="0"
                        />
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={item.misePercent ?? MISE_DEFAULT}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateMisePercent(index, isNaN(val) ? MISE_DEFAULT : val)
                      }}
                      className="h-8 w-16 ml-auto text-right font-mono text-sm bg-secondary/50 border-border focus:border-primary focus:ring-1 focus:ring-primary/30"
                      min="0"
                      max="50"
                      step="0.5"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "font-mono text-sm font-medium",
                        costTextDark ? "text-foreground" : cost > 10 ? "text-accent" : "text-foreground"
                      )}
                    >
                      {cost.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      className={cn(
                        "h-7 w-7 p-0 transition-opacity",
                        isHovered
                          ? "opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                          : "opacity-0"
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="h-20 text-center text-sm text-muted-foreground"
                >
                  {t("posCostNoIngredients")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 소스 추가 팝업 - 소스 원가에서 등록한 소스 목록 */}
      {type === "food" && (
        <Dialog open={addSauceDialogOpen} onOpenChange={setAddSauceDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("posCostAddSauce") || "소스 추가"} — {t("posCostCategorySauce") || "소스"}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 min-h-[200px] py-2">
              {sauceIngs.filter((s) => !usedCodes.has(s.code)).length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("posCostSauceEmpty") || "등록된 소스가 없습니다."}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {sauceIngs
                    .filter((s) => !usedCodes.has(s.code))
                    .map((sauce) => {
                      const itemCode = getIngredientItemCode(sauce.code) ?? String(sauce.code)
                      return (
                        <button
                          key={sauce.code}
                          type="button"
                          className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 rounded-none hover:bg-muted/80"
                          onClick={() => addSauceImmediately(sauce.code)}
                        >
                          <span className="font-mono text-muted-foreground shrink-0 w-14">{itemCode}</span>
                          <span className="truncate flex-1">{sauce.name}</span>
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {sauce.bahtPerUnit.toFixed(3)} ฿/g
                          </span>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSauceDialogOpen(false)}>
                {t("close") || "닫기"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 재료 추가 팝업 - 품목 관리만, 품목 클릭 시 즉시 추가 (단위/수량은 테이블에서 입력) */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("posCostAddItem")} — {t("posCostCategoryItems") || "품목 관리"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder={t("posCostSearchIngredientPh") || "이름 또는 코드 검색..."}
                value={addSearchTerm}
                onChange={(e) => setAddSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t("itemsCategory")}</label>
              <Select value={addCategoryFilter} onValueChange={setAddCategoryFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("itemsCategoryAll") || "전체 카테고리"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
                  {itemCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-y-auto flex-1 min-h-[180px] border rounded-md py-2">
              {addDialogFiltered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("posCostNoIngredientsFound") || "검색 결과가 없습니다"}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {addDialogFiltered.map((ing) => {
                    const itemCode = getIngredientItemCode(ing.code) ?? String(ing.code)
                    const units = getIngredientStandardUnits(ing.code)
                    const firstUnitKey = units?.length ? `${units[0].unit}::${units[0].totalQuantity}` : null
                    const bahtPerUnit = firstUnitKey ? getBahtPerStandardUnit(ing.code, firstUnitKey) : getIngredient(ing.code)?.bahtPerUnit
                    return (
                      <button
                        key={ing.code}
                        type="button"
                        className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 rounded-none hover:bg-muted/80"
                        onClick={() => addItemImmediately(ing.code)}
                      >
                        <span className="font-mono text-muted-foreground shrink-0 w-14">{itemCode}</span>
                        <span className="truncate flex-1">{ing.name}</span>
                        {ing.categoryRaw && (
                          <span className="text-[10px] text-muted-foreground/80 shrink-0">{ing.categoryRaw}</span>
                        )}
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {bahtPerUnit != null ? `${bahtPerUnit.toFixed(2)} ฿/${units?.[0]?.unit ?? ""}` : "-"}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {t("close") || "닫기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subtotal */}
      <div className="flex items-center justify-between border-t border-border bg-secondary/30 px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("posCostSubtotal")}
        </span>
        <span
          className={cn(
            "font-mono text-base font-bold",
            "text-primary"
          )}
        >
          {subTotal.toFixed(2)} THB
        </span>
      </div>
    </div>
  )
}
