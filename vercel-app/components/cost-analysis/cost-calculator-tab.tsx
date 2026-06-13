"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useCallback, useMemo, useEffect, useReducer } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { RotateCcw, Save, RefreshCw } from "lucide-react"
import { MenuInfoPanel } from "@/components/cost-analysis/menu-info-panel"
import { IngredientTable } from "@/components/cost-analysis/ingredient-table"
import { CostSummary } from "@/components/cost-analysis/cost-summary"
import { CostChart } from "@/components/cost-analysis/cost-chart"
import { PosCostCalculatorWhatIf } from "@/components/cost-analysis/pos-cost-calculator-what-if"
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
  getIngredientCodeByItemCode,
  getIngredient,
  getIngredientStandardUnits,
  getQuantityFactorToStore,
  MISE_DEFAULT,
  resolveDeliveryAppFeePercent,
  pickDefaultStandardUnitKey,
} from "@/lib/cost-data"
import {
  coerceQuantityUnitKeyForStandardUnits,
  normalizeQuantityUnitKey,
} from "@/lib/pos-menu-ingredient-quantity-unit"
import type { MenuItem, RecipeItem } from "@/lib/cost-data"
import type { PosMenuCostAnalysisRow, PosMenuIngredient, SauceRow } from "@/lib/api-client"
import { POS_MAIN_CATEGORIES, mainCategoryMatches, getPresetCategoriesForMain } from "@/lib/pos-menu-categories"
import { posCostAnalysisRowKey, isCostAnalysisBaseRow } from "@/lib/pos-cost-analysis-keys"
import { getSauces, getAdminItems, getPosMenuIngredients, savePosMenu, savePosMenuOption, getPosMenuCostAnalysis, replacePosMenuIngredients } from "@/lib/api-client"

interface CostCalculatorTabProps {
  /** false면 조회만 (가맹·매니저) */
  canEdit?: boolean
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
    const itemCode = String(b.itemCode ?? "").trim()
    const resolved = getIngredientCodeByItemCode(itemCode)
    const codeNum = parseInt(itemCode, 10)
    const code = resolved ?? (!isNaN(codeNum) ? codeNum : 10000 + idx)
    const cat = b.ingredientType === "packaging" ? "packaging" : "food"
    if (!resolved) {
      runtimeItems.push({ code, name: b.itemName, bahtPerUnit: b.costPerUnit, category: cat, itemCode })
    }
    if (itemCode.startsWith("MENU:")) {
      const item: RecipeItem = {
        ingredientCode: code,
        quantity: Number(b.quantity) || 0,
        misePercent: (b.lossRate ?? 0) || MISE_DEFAULT,
        savedItemCode: itemCode,
      }
      if (cat === "packaging") packaging.push(item)
      else food.push(item)
      return
    }
    const fallbackKey = cat === "packaging" ? "ea::1" : pickDefaultStandardUnitKey(code) || "g::1"
    const rawKey = b.quantityUnitKey ?? fallbackKey
    const units = getIngredientStandardUnits(code)
    const unitKey = units?.length ? coerceQuantityUnitKeyForStandardUnits(rawKey, units) : rawKey
    const factor = getQuantityFactorToStore(code, unitKey)
    const item: RecipeItem = {
      ingredientCode: code,
      quantity: (Number(b.quantity) || 0) * factor,
      misePercent: (b.lossRate ?? 0) || MISE_DEFAULT,
      savedItemCode: String(b.itemCode ?? "").trim() || undefined,
      quantityUnitKey: unitKey,
    }
    if (cat === "packaging") packaging.push(item)
    else food.push(item)
  })

  setRuntimeIngredients(runtimeItems)
  return { food, packaging }
}

/** 원가 분석 API에 breakdown이 비어 있을 때(저장 직후 스냅샷 지연 등) BOM API로 폼 상태 복원 */
function posMenuIngredientsToRecipeState(ings: PosMenuIngredient[]): { food: RecipeItem[]; packaging: RecipeItem[] } {
  const food: RecipeItem[] = []
  const packaging: RecipeItem[] = []
  const runtimeItems: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode: string }> = []

  ings.forEach((ing, idx) => {
    const itemCode = String(ing.itemCode ?? "").trim()
    if (!itemCode) return
    const cat = ing.ingredientType === "packaging" ? "packaging" : "food"
    const resolved = getIngredientCodeByItemCode(itemCode)
    const codeNum = parseInt(itemCode, 10)
    const code = resolved ?? (!isNaN(codeNum) ? codeNum : 10000 + idx)
    const meta = getIngredient(code)
    const name = meta?.name ?? itemCode
    const bahtPerUnit = meta && "bahtPerUnit" in meta ? Number(meta.bahtPerUnit) || 0 : 0
    if (!resolved) {
      runtimeItems.push({ code, name, bahtPerUnit, category: cat, itemCode })
    }
    const fallbackKey = cat === "packaging" ? "ea::1" : pickDefaultStandardUnitKey(code) || "g::1"
    const rawKey = ing.quantityUnitKey ?? fallbackKey
    const units = getIngredientStandardUnits(code)
    const quantityUnitKey = units?.length ? coerceQuantityUnitKeyForStandardUnits(rawKey, units) : rawKey
    const item: RecipeItem = {
      ingredientCode: code,
      quantity: Number(ing.quantity) || 0,
      misePercent: (ing.lossRate ?? 0) || MISE_DEFAULT,
      savedItemCode: itemCode,
      quantityUnitKey,
    }
    if (cat === "packaging") packaging.push(item)
    else food.push(item)
  })

  setRuntimeIngredients(runtimeItems)
  return { food, packaging }
}

/** getPosMenuIngredients 쿼리: 기본 행은 파라미터 생략(null·0 병합 조회와 일치) */
function ingredientsQueryOptionId(row: PosMenuCostAnalysisRow): string | undefined {
  if (isCostAnalysisBaseRow(row)) return undefined
  return String(row.optionId ?? "").trim() || undefined
}

function savePayloadOptionId(row: PosMenuCostAnalysisRow): number | null {
  if (isCostAnalysisBaseRow(row)) return null
  const n = Number(row.optionId)
  return Number.isFinite(n) ? n : null
}

export function CostCalculatorTab({ canEdit = true, initialLoadFromRow, onClearLoad, onSaveSuccess, onReloadMenu, menuRows = [], onMenuSelect }: CostCalculatorTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menuItem, setMenuItem] = useState<MenuItem>(emptyMenuItem)
  const [foodItems, setFoodItems] = useState<RecipeItem[]>(emptyFoodRecipe)
  const [packagingItems, setPackagingItems] = useState<RecipeItem[]>(emptyPackagingRecipe)
  /** 재료·배합 API 로드 완료 시 재렌더 (배합 원가 반영) */
  const [, bumpAfterRuntimeLoad] = useReducer((n: number) => n + 1, 0)
  const [sauceRowsFull, setSauceRowsFull] = useState<SauceRow[]>([])

  const storeUseSauceRowsForDialog = useMemo(
    () =>
      sauceRowsFull
        .filter((s) => s.usageKind === "store_use")
        .map((s) => ({ code: s.code, name: s.name, costPerUnit: s.costPerUnit })),
    [sauceRowsFull]
  )

  const refreshApiItemsForCostRuntime = useCallback(async () => {
    const items = await getAdminItems()
    setRuntimeApiItems(Array.isArray(items) ? items : [])
  }, [])

  useEffect(() => {
    let done = 0
    const check = () => {
      done += 1
      if (done >= 2) bumpAfterRuntimeLoad()
    }
    getAdminItems()
      .then((items) => {
        setRuntimeApiItems(items)
        check()
      })
      .catch(check)
    getSauces()
      .then((list) => {
        const L = list || []
        setSauceRowsFull(L)
        setRuntimeSauces(L, { mode: "calculator" })
        check()
      })
      .catch((err) => {
        console.error("[CostCalculatorTab] getSauces failed:", err)
        setSauceRowsFull([])
        setRuntimeSauces([], { mode: "calculator" })
        check()
      })
  }, [])

  useEffect(() => {
    const row = initialLoadFromRow && typeof initialLoadFromRow === "object" && !Array.isArray(initialLoadFromRow) && initialLoadFromRow.menuId != null
      ? { ...initialLoadFromRow, breakdown: Array.isArray(initialLoadFromRow.breakdown) ? initialLoadFromRow.breakdown : [] }
      : null
    if (row) {
      const priceHall = row.priceHall ?? 0
      const priceDelivery = row.priceDelivery ?? null
      const deliveryPercent = resolveDeliveryAppFeePercent(row.deliveryAppFeePercent)
      const rowWithCode = row as PosMenuCostAnalysisRow & { displayCode?: string }
      setMenuItem({
        ...emptyMenuItem,
        menuCode: rowWithCode.displayCode ?? row.menuCode ?? "",
        menuName: (row.menuName ?? "") + (row.optionName ? ` (${row.optionName})` : ""),
        category: row.category ?? "",
        categoryMain: row.categoryMain ?? "",
        serviceType: "Dine-In",
        inclVat: priceHall,
        vatIncluded: row.vatIncluded !== false,
        priceHall,
        priceDelivery,
        deliveryPercent,
        cookingTimeMin: row.cookingTimeMin ?? null,
      })

      const breakdown = row.breakdown
      if (breakdown.length > 0) {
        const { food, packaging } = breakdownToRecipeItems(row)
        setFoodItems(food)
        setPackagingItems(packaging)
        return
      }

      /** breakdown이 비어 있으면(저장 직후 목록 갱신 지연·RLS 등) BOM API로 재료 복원 */
      setFoodItems(emptyFoodRecipe)
      setPackagingItems(emptyPackagingRecipe)
      const menuIdStr = String(row.menuId ?? "").trim()
      if (!menuIdStr) return

      let cancelled = false
      void (async () => {
        try {
          const opt = ingredientsQueryOptionId(row)
          const ings = await getPosMenuIngredients({ menuId: menuIdStr, optionId: opt })
          if (cancelled) return
          const { food, packaging } = posMenuIngredientsToRecipeState(Array.isArray(ings) ? ings : [])
          setFoodItems(food)
          setPackagingItems(packaging)
        } catch {
          if (!cancelled) {
            setFoodItems(emptyFoodRecipe)
            setPackagingItems(emptyPackagingRecipe)
          }
        }
      })()

      return () => {
        cancelled = true
      }
    } else {
      clearRuntimeIngredients()
      setMenuItem(emptyMenuItem)
      setFoodItems(emptyFoodRecipe)
      setPackagingItems(emptyPackagingRecipe)
    }
    // cleanup에서 clearRuntimeIngredients 금지: Strict Mode·탭 전환 등으로 맵만 비면
    // getIngredientItemCode가 전부 실패 → 저장 시 toSave 빈 배열 → DB 재료 전량 삭제됨.
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
  const canSave = canEdit && !!initialLoadFromRow
  const handleSave = useCallback(async () => {
    if (!initialLoadFromRow || saving) return
    const menuId = Number(initialLoadFromRow.menuId)
    const optionId = savePayloadOptionId(initialLoadFromRow)
    if (!menuId) return

    const allItems = [
      ...foodItems.map((r) => ({ ...r, ingredientType: "food" as const })),
      ...packagingItems.map((r) => ({ ...r, ingredientType: "packaging" as const })),
    ]
    const toSave: {
      itemCode: string
      quantity: number
      lossRate: number
      ingredientType: "food" | "packaging"
      quantityUnitKey: string
    }[] = []
    for (const r of allItems) {
      const resolved = getIngredientItemCode(r.ingredientCode) ?? r.savedItemCode
      const itemCode = String(resolved ?? "").trim()
      if (!itemCode) continue
      if (!(Number(r.quantity) > 0)) continue
      const unitKey = normalizeQuantityUnitKey(
        r.quantityUnitKey ?? pickDefaultStandardUnitKey(r.ingredientCode),
        r.ingredientType
      )
      toSave.push({
        itemCode,
        quantity: r.quantity,
        lossRate: r.misePercent ?? MISE_DEFAULT,
        ingredientType: r.ingredientType,
        quantityUnitKey: unitKey,
      })
    }

    setSaving(true)
    try {
      const uiIngredientRows = foodItems.length + packagingItems.length
      if (uiIngredientRows > 0 && toSave.length === 0) {
        throw new Error(
          t("posCostSaveBlockedEmptyIngredients") ||
            "재료 품목코드를 확인할 수 없어 저장할 수 없습니다. 목록에서 메뉴를 다시 선택한 뒤 수정해 주세요."
        )
      }
      if (toSave.length === 0) {
        const existing = await getPosMenuIngredients(
          {
            menuId: String(menuId),
            optionId: ingredientsQueryOptionId(initialLoadFromRow),
          },
          { requireOnline: true }
        )
        if (existing.length > 0) {
          const ok = await appConfirm(
            t("posCostSaveConfirmClearAllBom") ||
              "There are no ingredients on the form but the menu still has BOM rows in the database. Save will delete all of them. Continue?"
          )
          if (!ok) return
        }
      }
      const replaceRes = await replacePosMenuIngredients(
        {
          menuId,
          optionId,
          items: toSave,
        },
        { requireOnline: true }
      )
      if (!replaceRes?.success) {
        throw new Error(replaceRes?.message || t("msg_save_fail") || "저장에 실패했습니다.")
      }

      const pHall = menuItem.priceHall ?? initialLoadFromRow.priceHall ?? 0
      const pDelivery = menuItem.priceDelivery ?? initialLoadFromRow.priceDelivery ?? null
      const stripTrailingParenOption = (n: string) => String(n ?? "").replace(/\s*\([^)]+\)$/, "").trim()
      const optionDisplayName =
        stripTrailingParenOption(String(initialLoadFromRow.menuName ?? "")) ||
        stripTrailingParenOption(String(menuItem.menuName ?? ""))
      if (optionId != null) {
        const baseRow = menuRows?.find((r) => r.menuId === String(menuId) && isCostAnalysisBaseRow(r))
        const baseHall = baseRow?.priceHall ?? 0
        const baseDelivery = baseRow?.priceDelivery ?? baseHall
        const modHall = Math.round((pHall - baseHall) * 10) / 10
        const modDelivery = pDelivery != null ? Math.round((pDelivery - (baseDelivery || baseHall)) * 10) / 10 : modHall
        await savePosMenuOption(
          {
            id: String(optionId),
            menuId,
            name: String(initialLoadFromRow.optionName ?? "").trim() || optionDisplayName,
            priceModifier: modHall,
            priceModifierDelivery: modDelivery,
          },
          { requireOnline: true }
        )
      }
      /** POS 메뉴 마스터(카테고리·사진·판매가)는 메뉴 관리에서만 수정 — 원가 전용 필드만 반영 */
      await savePosMenu(
        {
          id: String(menuId),
          deliveryAppFeePercent: menuItem.deliveryPercent,
        },
        { requireOnline: true }
      )

      const reloadIngs = await getPosMenuIngredients(
        {
          menuId: String(menuId),
          optionId: ingredientsQueryOptionId(initialLoadFromRow),
        },
        { requireOnline: true }
      )
      const synced = posMenuIngredientsToRecipeState(Array.isArray(reloadIngs) ? reloadIngs : [])
      setFoodItems(synced.food)
      setPackagingItems(synced.packaging)

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
          {canEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="h-9 gap-1.5 px-3 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("posCostReset")}
            </Button>
          ) : null}
          {initialLoadFromRow && onReloadMenu && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const data = await getPosMenuCostAnalysis()
                  const arr = Array.isArray(data) ? data : []
                  const key = posCostAnalysisRowKey(initialLoadFromRow)
                  const fresh = arr.find((r) => posCostAnalysisRowKey(r) === key)
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
          {canEdit ? (
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
          ) : null}
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
            readOnlyEdits={!canEdit}
            menuId={initialLoadFromRow ? String(initialLoadFromRow.menuId) : undefined}
            onSaveCookingTime={
              canEdit && initialLoadFromRow
                ? async (id, cookingTimeMin) => {
                    try {
                      await savePosMenu({ id, cookingTimeMin }, { requireOnline: true })
                      onSaveSuccess?.()
                    } catch (e) {
                      await appAlert(String(e))
                    }
                  }
                : undefined
            }
          />
          <div className="space-y-6">
            <IngredientTable
              title={t("posCostFoodIngredients")}
              type="food"
              items={foodItems}
              onItemsChange={setFoodItems}
              costTextDark
              addSauceDialogStoreUseRows={storeUseSauceRowsForDialog}
              ingredientPickerHideSauceUsageKinds={["store_use"]}
              refreshApiItemsBeforeAddDialog={refreshApiItemsForCostRuntime}
              readOnly={!canEdit}
            />
            <IngredientTable
              title={t("posCostPackagingDelivery")}
              type="packaging"
              items={packagingItems}
              onItemsChange={setPackagingItems}
              addDialogRequireStandardUnits={false}
              costTextDark
              refreshApiItemsBeforeAddDialog={refreshApiItemsForCostRuntime}
              readOnly={!canEdit}
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
            onDeliveryPercentChange={
              canEdit ? (v) => setMenuItem((prev) => ({ ...prev, deliveryPercent: v })) : undefined
            }
            miseIncludedInFood
            editablePrice={canEdit && !!initialLoadFromRow}
            onPriceChange={
              canEdit && initialLoadFromRow
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
            serviceType={menuItem.serviceType}
          />
          {initialLoadFromRow ? (
            <PosCostCalculatorWhatIf
              foodItems={foodItems}
              packagingItems={packagingItems}
              priceHall={menuItem.priceHall ?? initialLoadFromRow.priceHall ?? 0}
              priceDelivery={menuItem.priceDelivery ?? initialLoadFromRow.priceDelivery}
              vatIncluded={menuItem.vatIncluded !== false}
              deliveryFeePercent={menuItem.deliveryPercent}
              serviceType={menuItem.serviceType}
              misePercent={menuItem.misePercent}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
