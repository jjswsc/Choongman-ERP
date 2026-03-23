"use client"
import { appAlert } from "@/lib/app-message"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { RotateCcw, Save, RefreshCw } from "lucide-react"
import { MenuInfoPanel } from "@/components/cost-analysis/menu-info-panel"
import { IngredientTable } from "@/components/cost-analysis/ingredient-table"
import { CostSummary } from "@/components/cost-analysis/cost-summary"
import { CostChart } from "@/components/cost-analysis/cost-chart"
import {
  emptyMenuItem,
  emptyFoodRecipe,
  emptyPackagingRecipe,
  calculateSubTotal,
  setRuntimeIngredients,
  setRuntimeSauces,
  setRuntimeApiItems,
  clearRuntimeIngredients,
  getIngredientItemCode,
  MISE_DEFAULT,
} from "@/lib/cost-data"
import type { MenuItem, RecipeItem } from "@/lib/cost-data"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import { POS_MAIN_CATEGORIES, mainCategoryMatches, getPresetCategoriesForMain } from "@/lib/pos-menu-categories"
import { getSauces, getAdminItems, getPosMenuIngredients, savePosMenuIngredient, deletePosMenuIngredient, savePosMenu, savePosMenuOption, getPosMenuCostAnalysis } from "@/lib/api-client"

interface CostCalculatorTabProps {
  initialLoadFromRow?: PosMenuCostAnalysisRow | null
  onClearLoad?: () => void
  onSaveSuccess?: () => void
  /** 불러오기 시 선택 메뉴 갱신용 */
  onReloadMenu?: (row: PosMenuCostAnalysisRow) => void
  /** POS 메뉴 목록 (카테고리 목록 추출·검색용) */
  menuRows?: PosMenuCostAnalysisRow[]
  /** 메뉴 검색에서 선택 시 (목록 로드) */
  onMenuSelect?: (row: PosMenuCostAnalysisRow) => void
}

function breakdownToRecipeItems(row: PosMenuCostAnalysisRow): { food: RecipeItem[]; packaging: RecipeItem[] } {
  const food: RecipeItem[] = []
  const packaging: RecipeItem[] = []
  const runtimeItems: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode: string }> = []

  const breakdown = Array.isArray(row.breakdown) ? row.breakdown : []
  breakdown.forEach((b, idx) => {
    const codeNum = parseInt(b.itemCode, 10)
    const code = !isNaN(codeNum) ? codeNum : 10000 + idx
    const cat = b.ingredientType === "packaging" ? "packaging" : "food"
    runtimeItems.push({ code, name: b.itemName, bahtPerUnit: b.costPerUnit, category: cat, itemCode: b.itemCode })
    const item: RecipeItem = {
      ingredientCode: code,
      quantity: b.quantity,
      misePercent: (b.lossRate ?? 0) || MISE_DEFAULT,
    }
    if (cat === "packaging") packaging.push(item)
    else food.push(item)
  })

  setRuntimeIngredients(runtimeItems)
  return { food, packaging }
}

export function CostCalculatorTab({ initialLoadFromRow, onClearLoad, onSaveSuccess, onReloadMenu, menuRows = [], onMenuSelect }: CostCalculatorTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menuItem, setMenuItem] = useState<MenuItem>(emptyMenuItem)
  const [foodItems, setFoodItems] = useState<RecipeItem[]>(emptyFoodRecipe)
  const [packagingItems, setPackagingItems] = useState<RecipeItem[]>(emptyPackagingRecipe)
  /** 재료·소스 API 로드 완료 시 재렌더 (소스 원가 반영) */
  const [runtimeReady, setRuntimeReady] = useState(false)

  useEffect(() => {
    let done = 0
    const check = () => {
      done += 1
      if (done >= 2) setRuntimeReady(true)
    }
    getAdminItems()
      .then((items) => {
        setRuntimeApiItems(items)
        check()
      })
      .catch(check)
    getSauces()
      .then((list) => {
        setRuntimeSauces(list)
        check()
      })
      .catch(check)
  }, [])

  useEffect(() => {
    const row = initialLoadFromRow && typeof initialLoadFromRow === "object" && !Array.isArray(initialLoadFromRow) && initialLoadFromRow.menuId != null
      ? { ...initialLoadFromRow, breakdown: Array.isArray(initialLoadFromRow.breakdown) ? initialLoadFromRow.breakdown : [] }
      : null
    if (row) {
      const { food, packaging } = breakdownToRecipeItems(row)
      const priceHall = row.priceHall ?? 0
      const priceDelivery = row.priceDelivery ?? null
      const rowWithCode = row as PosMenuCostAnalysisRow & { displayCode?: string }
      setMenuItem({
        ...emptyMenuItem,
        menuCode: rowWithCode.displayCode ?? row.menuCode ?? "",
        menuName: (row.menuName ?? "") + (row.optionName ? ` (${row.optionName})` : ""),
        category: row.category ?? "",
        categoryMain: row.categoryMain ?? "",
        inclVat: priceHall,
        vatIncluded: row.vatIncluded !== false,
        priceHall,
        priceDelivery,
        cookingTimeMin: row.cookingTimeMin ?? null,
      })
      setFoodItems(food)
      setPackagingItems(packaging)
    } else {
      clearRuntimeIngredients()
      setMenuItem(emptyMenuItem)
      setFoodItems(emptyFoodRecipe)
      setPackagingItems(emptyPackagingRecipe)
    }
    return () => clearRuntimeIngredients()
  }, [initialLoadFromRow])

  const foodSubTotal = useMemo(() => calculateSubTotal(foodItems), [foodItems])
  const packagingSubTotal = useMemo(() => calculateSubTotal(packagingItems), [packagingItems])

  const categoriesFromMenus = useMemo(() => {
    const set = new Set(menuRows.map((r) => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [menuRows])

  const mainCategoriesFromMenus = useMemo(() => {
    const fromRows = new Set(
      menuRows.map((r) => r.categoryMain).filter((c): c is string => typeof c === "string" && c !== "")
    )
    return Array.from(new Set([...POS_MAIN_CATEGORIES, ...fromRows]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [menuRows])

  const categoriesFromMenusByMain = useMemo(() => {
    return (mainCat: string) => {
      const preset = getPresetCategoriesForMain(mainCat)
      if (preset) {
        const fromRows = menuRows
          .filter((r) => mainCategoryMatches(mainCat, r.categoryMain, r.menuCode))
          .map((r) => r.category)
          .filter(Boolean)
        return Array.from(new Set([...preset, ...fromRows])).sort()
      }
      const fromRows = menuRows
        .filter((r) => mainCategoryMatches(mainCat, r.categoryMain, r.menuCode))
        .map((r) => r.category)
        .filter(Boolean)
      return Array.from(new Set(fromRows)).sort()
    }
  }, [menuRows])

  const handleReset = useCallback(() => {
    clearRuntimeIngredients()
    onClearLoad?.()
    setMenuItem(emptyMenuItem)
    setFoodItems(emptyFoodRecipe)
    setPackagingItems(emptyPackagingRecipe)
  }, [onClearLoad])

  const [saving, setSaving] = useState(false)
  const canSave = !!initialLoadFromRow
  const handleSave = useCallback(async () => {
    if (!initialLoadFromRow || saving) return
    const menuId = Number(initialLoadFromRow.menuId)
    const optionId = initialLoadFromRow.optionId ? Number(initialLoadFromRow.optionId) : null
    if (!menuId) return

    const allItems = [
      ...foodItems.map((r) => ({ ...r, ingredientType: "food" as const })),
      ...packagingItems.map((r) => ({ ...r, ingredientType: "packaging" as const })),
    ]
    const toSave: { itemCode: string; quantity: number; lossRate: number; ingredientType: "food" | "packaging" }[] = []
    for (const r of allItems) {
      const itemCode = getIngredientItemCode(r.ingredientCode)
      if (!itemCode?.trim()) continue
      toSave.push({
        itemCode: itemCode.trim(),
        quantity: r.quantity,
        lossRate: r.misePercent ?? MISE_DEFAULT,
        ingredientType: r.ingredientType,
      })
    }

    setSaving(true)
    try {
      const existing = await getPosMenuIngredients({
        menuId: String(menuId),
        optionId: optionId != null ? String(optionId) : (undefined as string | undefined),
      })
      for (const ing of existing) {
        const res = await deletePosMenuIngredient({ id: String(ing.id) })
        if (!res.success) throw new Error(res.message)
      }
      for (const row of toSave) {
        const res = await savePosMenuIngredient({
          menuId,
          optionId: optionId != null ? optionId : null,
          itemCode: row.itemCode,
          quantity: row.quantity,
          lossRate: row.lossRate,
          ingredientType: row.ingredientType,
        })
        if (!res.success) throw new Error(res.message)
      }

      const pHall = menuItem.priceHall ?? initialLoadFromRow.priceHall ?? 0
      const pDelivery = menuItem.priceDelivery ?? initialLoadFromRow.priceDelivery ?? null
      const code = String(initialLoadFromRow.menuCode ?? "").replace(/-\d+$/, "").trim()
      const name = String(initialLoadFromRow.menuName ?? "").replace(/\s*\([^)]+\)$/, "").trim()
      const category = String(initialLoadFromRow.category ?? "").trim()
      const categoryMain = String(initialLoadFromRow.categoryMain ?? "").trim()
      if (optionId != null) {
        const baseRow = menuRows?.find((r) => r.menuId === String(menuId) && !r.optionId)
        const baseHall = baseRow?.priceHall ?? 0
        const baseDelivery = baseRow?.priceDelivery ?? baseHall
        const modHall = Math.round((pHall - baseHall) * 10) / 10
        const modDelivery = pDelivery != null ? Math.round((pDelivery - (baseDelivery || baseHall)) * 10) / 10 : modHall
        const optRes = await savePosMenuOption({
          id: String(optionId),
          menuId,
          name: String(initialLoadFromRow.optionName ?? "").trim() || name,
          priceModifier: modHall,
          priceModifierDelivery: modDelivery,
        })
        if (!optRes.success) throw new Error(optRes.message)
      } else if (code && name) {
        const menuRes = await savePosMenu({
          id: String(menuId),
          code,
          name,
          category,
          categoryMain,
          price: Math.round(pHall),
          priceDelivery: pDelivery != null ? Math.round(pDelivery) : null,
        })
        if (!menuRes.success) throw new Error(menuRes.message)
      }

      await appAlert(t("msg_save_success") || "저장되었습니다.")
      onSaveSuccess?.()
    } catch (e) {
      await appAlert(String(e) || (t("msg_save_fail_detail") || "저장에 실패했습니다."))
    } finally {
      setSaving(false)
    }
  }, [initialLoadFromRow, foodItems, packagingItems, menuItem, menuRows, saving, t, onSaveSuccess])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-9 gap-1.5 px-3 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("posCostReset")}
          </Button>
          {initialLoadFromRow && onReloadMenu && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const data = await getPosMenuCostAnalysis()
                  const arr = Array.isArray(data) ? data : []
                  const key = initialLoadFromRow.optionId
                    ? `${initialLoadFromRow.menuId}:${initialLoadFromRow.optionId}`
                    : String(initialLoadFromRow.menuId)
                  const fresh = arr.find(
                    (r) => (r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId) === key
                  )
                  if (fresh) onReloadMenu(fresh)
                  else await appAlert(t("posCostLoadFail") || "데이터를 찾을 수 없습니다.")
                } catch {
                  await appAlert(t("msg_load_fail") || "불러오기에 실패했습니다.")
                }
              }}
              className="h-9 gap-1.5 px-3 text-xs"
              title={t("posCostLoadSaved") || "저장된 재료·가격 다시 불러오기"}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("posCostLoadSaved") || "불러오기"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="h-9 gap-1.5 px-3 text-xs"
            title={!canSave ? (t("posCostSaveHint") || "목록에서 메뉴를 선택한 후 저장할 수 있습니다.") : undefined}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? (t("loading") || "저장 중...") : (t("itemsBtnSave") || "저장")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <MenuInfoPanel
            menuItem={menuItem}
            onMenuItemChange={setMenuItem}
            categories={menuItem.categoryMain ? categoriesFromMenusByMain(menuItem.categoryMain) : categoriesFromMenus}
            mainCategories={mainCategoriesFromMenus}
            menuRows={menuRows}
            onMenuSelect={onMenuSelect}
            onRequestChangeMenu={onClearLoad}
            readOnlyMenuInfo={!!initialLoadFromRow}
            menuId={initialLoadFromRow ? String(initialLoadFromRow.menuId) : undefined}
            onSaveCookingTime={
              initialLoadFromRow
                ? async (id, cookingTimeMin) => {
                    try {
                      const code = String(initialLoadFromRow.menuCode ?? "").replace(/-\d+$/, "").trim()
                      const name = String(initialLoadFromRow.menuName ?? "").replace(/\s*\([^)]+\)$/, "").trim()
                      if (code && name) {
                        // 조리 시간만 바꿔도 category·가격이 사라지지 않도록 현재 값을 함께 전달
                        await savePosMenu({
                          id,
                          code,
                          name,
                          cookingTimeMin,
                          category: menuItem.category ?? initialLoadFromRow.category ?? "",
                          categoryMain: menuItem.categoryMain ?? initialLoadFromRow.categoryMain ?? "",
                          price: menuItem.priceHall ?? initialLoadFromRow.priceHall ?? 0,
                          priceDelivery: menuItem.priceDelivery ?? initialLoadFromRow.priceDelivery ?? null,
                        })
                        onSaveSuccess?.()
                      }
                    } catch (e) {
                      await appAlert(String(e))
                    }
                  }
                : undefined
            }
          />
          <div className="space-y-6">
            <IngredientTable title={t("posCostFoodIngredients")} type="food" items={foodItems} onItemsChange={setFoodItems} costTextDark />
            <IngredientTable
              title={t("posCostPackagingDelivery")}
              type="packaging"
              items={packagingItems}
              onItemsChange={setPackagingItems}
              addDialogRequireStandardUnits={false}
              costTextDark
            />
          </div>
        </div>

        <div className="space-y-6 self-start">
          <CostSummary
            foodSubTotal={foodSubTotal}
            packagingSubTotal={packagingSubTotal}
            misePercent={menuItem.misePercent}
            inclVat={menuItem.inclVat}
            vatIncluded={menuItem.vatIncluded !== false}
            serviceType={menuItem.serviceType}
            deliveryPercent={menuItem.deliveryPercent}
            onDeliveryPercentChange={(v) => setMenuItem((prev) => ({ ...prev, deliveryPercent: v }))}
            miseIncludedInFood
            editablePrice={!!initialLoadFromRow}
            onPriceChange={
              initialLoadFromRow
                ? (priceHall, priceDelivery) =>
                    setMenuItem((prev) => ({
                      ...prev,
                      priceHall,
                      priceDelivery,
                      inclVat: priceDelivery ?? priceHall,
                    }))
                : undefined
            }
            basePriceHall={
              initialLoadFromRow?.optionId
                ? menuRows?.find((r) => r.menuId === initialLoadFromRow?.menuId && !r.optionId)
                    ?.priceHall
                : undefined
            }
            basePriceDelivery={
              initialLoadFromRow?.optionId
                ? menuRows?.find((r) => r.menuId === initialLoadFromRow?.menuId && !r.optionId)
                    ?.priceDelivery
                : undefined
            }
          />
          <CostChart
            foodItems={foodItems}
            packagingItems={packagingItems}
            misePercent={0}
          />
        </div>
      </div>
    </div>
  )
}
