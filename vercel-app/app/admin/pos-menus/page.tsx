"use client"

import * as React from "react"
import { UtensilsCrossed, FilePlus, Save, RotateCcw, RefreshCw, Pencil, Trash2, Plus, ChevronDown, ChevronRight, LayoutGrid, Pizza, Layers, Monitor, Settings2, X, PauseCircle, PlayCircle, FolderTree } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuCategoriesConfig,
  savePosMenuCategoriesConfig,
  type PosMenuCategoriesConfig,
  getPosMenuOptions,
  getPosMenuIngredients,
  getMenuCost,
  getAdminItems,
  savePosMenu,
  savePosMenuOption,
  savePosMenuIngredient,
  deletePosMenu,
  deletePosMenuOption,
  deletePosMenuIngredient,
  updatePosMenuSoldOut,
  type PosMenu,
  type PosMenuOption,
  type PosMenuIngredient,
} from "@/lib/api-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { POS_MAIN_CATEGORIES, POS_CATEGORIES_BY_MAIN } from "@/lib/pos-menu-categories"

/** 옵션관리 탭: 고정 2단계 — 1. 사이즈, 2. 부위 */
const OPTION_SIZE_VALUES = ["S", "M", "L"]
const OPTION_PART_VALUES = ["순살", "윙", "봉"]

const emptyForm = {
  code: "",
  name: "",
  categoryMain: "",
  category: "",
  price: "",
  priceDelivery: "",
  imageUrl: "",
  vatIncluded: true,
  isActive: true,
}

const defaultCategoriesConfig: PosMenuCategoriesConfig = {
  mainCategories: [...POS_MAIN_CATEGORIES],
  categoriesByMain: Object.fromEntries(
    Object.entries(POS_CATEGORIES_BY_MAIN).map(([k, v]) => [k, [...v]])
  ) as Record<string, string[]>,
}

function CategoriesTab({
  config,
  onSave,
  saving,
  t,
}: {
  config: PosMenuCategoriesConfig | null
  onSave: (next: PosMenuCategoriesConfig, applyToMenus: boolean) => Promise<void>
  saving: boolean
  t: (k: string) => string
}) {
  const [local, setLocal] = React.useState<PosMenuCategoriesConfig>(() => config || defaultCategoriesConfig)
  const [applyToMenus, setApplyToMenus] = React.useState(true)
  const [newMain, setNewMain] = React.useState("")
  const [newSubByMain, setNewSubByMain] = React.useState<Record<string, string>>({})
  const [editingSub, setEditingSub] = React.useState<{ main: string; idx: number } | null>(null)
  const [editingSubValue, setEditingSubValue] = React.useState("")

  React.useEffect(() => {
    setLocal(config || defaultCategoriesConfig)
  }, [config])

  const addMain = () => {
    const v = newMain.trim()
    if (!v || local.mainCategories.includes(v)) return
    setLocal((p) => ({
      mainCategories: [...p.mainCategories, v].sort(),
      categoriesByMain: { ...p.categoriesByMain, [v]: p.categoriesByMain[v] || [] },
    }))
    setNewMain("")
  }

  const removeMain = (main: string) => {
    setLocal((p) => {
      const { [main]: _, ...rest } = p.categoriesByMain
      return {
        mainCategories: p.mainCategories.filter((m) => m !== main),
        categoriesByMain: rest,
      }
    })
  }

  const addSub = (main: string) => {
    const v = (newSubByMain[main] ?? "").trim()
    if (!v) return
    const existing = local.categoriesByMain[main] || []
    if (existing.includes(v)) return
    setLocal((p) => ({
      ...p,
      categoriesByMain: {
        ...p.categoriesByMain,
        [main]: [...(p.categoriesByMain[main] || []), v].sort(),
      },
    }))
    setNewSubByMain((prev) => ({ ...prev, [main]: "" }))
  }

  const updateSub = (main: string, idx: number, value: string) => {
    const v = value.trim()
    if (!v) return
    setLocal((p) => {
      const arr = [...(p.categoriesByMain[main] || [])]
      arr[idx] = v
      return { ...p, categoriesByMain: { ...p.categoriesByMain, [main]: arr } }
    })
    setEditingSub(null)
    setEditingSubValue("")
  }

  const removeSub = (main: string, idx: number) => {
    setLocal((p) => {
      const arr = (p.categoriesByMain[main] || []).filter((_, i) => i !== idx)
      return { ...p, categoriesByMain: { ...p.categoriesByMain, [main]: arr } }
    })
    setEditingSub(null)
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <p className="mb-4 text-sm text-muted-foreground">{t("posMenuTabCategoriesDesc")}</p>
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold">{t("posMenuCategoryMain") || "대분류"}</h4>
          <div className="flex flex-wrap gap-2">
            {local.mainCategories.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs"
              >
                {m}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-destructive/20"
                  onClick={() => removeMain(m)}
                  aria-label="삭제"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <div className="flex gap-1">
              <Input
                placeholder="대분류 추가"
                className="h-8 w-32 text-xs"
                value={newMain}
                onChange={(e) => setNewMain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMain())}
              />
              <Button size="sm" className="h-8 gap-1 px-2 text-xs" onClick={addMain}>
                <Plus className="h-3 w-3" />
                {t("itemsBtnAdd") || "추가"}
              </Button>
            </div>
          </div>
        </div>
        <div>
          <h4 className="mb-3 text-xs font-semibold">{t("posMenuCategory") || "소분류"}</h4>
          <div className="space-y-3">
            {local.mainCategories.map((main) => (
              <div key={main} className="rounded-lg border p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">{main}</div>
                <div className="flex flex-wrap gap-2">
                  {(local.categoriesByMain[main] || []).map((sub, idx) => (
                    <span
                      key={`${main}-${idx}-${sub}`}
                      className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
                    >
                      {editingSub?.main === main && editingSub.idx === idx ? (
                        <Input
                          autoFocus
                          className="h-6 w-24 text-xs"
                          value={editingSubValue}
                          onChange={(e) => setEditingSubValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateSub(main, idx, editingSubValue)
                            if (e.key === "Escape") setEditingSub(null)
                          }}
                        />
                      ) : (
                        sub
                      )}
                      {editingSub?.main === main && editingSub.idx === idx ? (
                        <Button size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => updateSub(main, idx, editingSubValue)}>
                          ✓
                        </Button>
                      ) : (
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted"
                          onClick={() => {
                            setEditingSub({ main, idx })
                            setEditingSubValue(sub)
                          }}
                          aria-label="수정"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-destructive/20"
                        onClick={() => removeSub(main, idx)}
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <div className="flex gap-1">
                    <Input
                      placeholder="소분류 추가"
                      className="h-8 w-28 text-xs"
                      value={newSubByMain[main] ?? ""}
                      onChange={(e) => setNewSubByMain((p) => ({ ...p, [main]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub(main))}
                    />
                    <Button size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => addSub(main)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={applyToMenus}
              onCheckedChange={(v) => setApplyToMenus(v === true)}
            />
            {t("posMenuCategoriesApplyToMenus") || "기존 메뉴에 적용"}
          </label>
          <Button onClick={() => onSave(local, applyToMenus)} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? t("loading") : t("itemsBtnSave") || "저장"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function PosMenusPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [allCategories, setAllCategories] = React.useState<string[]>([])
  const [allMainCategories, setAllMainCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [refreshLoading, setRefreshLoading] = React.useState(false)
  const [formData, setFormData] = React.useState(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [soldOutTogglingId, setSoldOutTogglingId] = React.useState<string | null>(null)
  const [menuOptions, setMenuOptions] = React.useState<PosMenuOption[]>([])
  const [menuIngredients, setMenuIngredients] = React.useState<PosMenuIngredient[]>([])
  const [items, setItems] = React.useState<{ code: string; name: string; category: string }[]>([])
  const [newOptionName, setNewOptionName] = React.useState("")
  const [newOptionModifier, setNewOptionModifier] = React.useState("0")
  const [newOptionModifierDelivery, setNewOptionModifierDelivery] = React.useState("")
  const [newOptionType, setNewOptionType] = React.useState<"substitution" | "additive">("substitution")
  const [newOptionItemCode, setNewOptionItemCode] = React.useState("")
  const [newOptionQuantity, setNewOptionQuantity] = React.useState("1")
  const [selectedIngredientOptionId, setSelectedIngredientOptionId] = React.useState<string>("")
  const [newIngredientCode, setNewIngredientCode] = React.useState("")
  const [newIngredientQty, setNewIngredientQty] = React.useState("1")
  const [newIngredientLossRate, setNewIngredientLossRate] = React.useState("0")
  const [newIngredientType, setNewIngredientType] = React.useState<"food" | "packaging">("food")
  const [menuCost, setMenuCost] = React.useState<{ cost: number; breakdown: { itemCode: string; itemName: string; quantity: number; lossRate: number; costPerUnit: number; costTotal: number }[] } | null>(null)
  const [baseMenuCost, setBaseMenuCost] = React.useState<number | null>(null)
  const [expandedMenuId, setExpandedMenuId] = React.useState<string | null>(null)
  const [expandedMenuData, setExpandedMenuData] = React.useState<{ options: PosMenuOption[] } | null>(null)
  const [formTab, setFormTab] = React.useState<"info" | "options" | "cost">("info")
  const [mainTab, setMainTab] = React.useState<"screen" | "optionsConfig" | "topping" | "set" | "categories" | "menuBoard">("screen")
  const [menuBoardView, setMenuBoardView] = React.useState<"pos" | "tablet" | "kiosk">("pos")
  const [optionsConfigSelectedMenuId, setOptionsConfigSelectedMenuId] = React.useState<string | null>(null)
  const [optionsConfigMenuOptions, setOptionsConfigMenuOptions] = React.useState<PosMenuOption[]>([])
  const [newOptionStepValues, setNewOptionStepValues] = React.useState<Record<string, string>>({})
  const [optionsConfigSearchTerm, setOptionsConfigSearchTerm] = React.useState("")
  const [optionsConfigCategoryFilter, setOptionsConfigCategoryFilter] = React.useState("all")
  const [categoriesConfig, setCategoriesConfig] = React.useState<PosMenuCategoriesConfig | null>(null)
  const [categoriesConfigSaving, setCategoriesConfigSaving] = React.useState(false)
  const [newOptionSize, setNewOptionSize] = React.useState("")
  const [newOptionPart, setNewOptionPart] = React.useState("")
  const [newOptionModifierPackaging, setNewOptionModifierPackaging] = React.useState("")

  React.useEffect(() => {
    Promise.all([getPosMenus(), getPosMenuCategories(), getPosMenuCategoriesConfig()])
      .then(([list, { categories, mainCategories }, config]) => {
        setMenus(list || [])
        setAllCategories(categories || [])
        setAllMainCategories(mainCategories || [])
        setCategoriesConfig(config || null)
      })
      .catch(() => {
        setMenus([])
        setAllCategories([])
        setAllMainCategories([])
        setCategoriesConfig(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const effectiveOptionIdForIngredients = selectedIngredientOptionId === "" || selectedIngredientOptionId === "null" ? undefined : selectedIngredientOptionId

  React.useEffect(() => {
    if (!editingId) {
      setMenuOptions([])
      setMenuIngredients([])
      setMenuCost(null)
      setBaseMenuCost(null)
      setSelectedIngredientOptionId("")
      return
    }
    getPosMenuOptions({ menuId: editingId }).then((opts) => setMenuOptions(opts || []))
  }, [editingId])

  React.useEffect(() => {
    if (!editingId) return
    getPosMenuIngredients({ menuId: editingId, optionId: effectiveOptionIdForIngredients ?? "null" }).then(setMenuIngredients)
  }, [editingId, effectiveOptionIdForIngredients])

  React.useEffect(() => {
    if (!editingId) return
    getMenuCost({ menuId: editingId, optionId: effectiveOptionIdForIngredients }).then((r) => setMenuCost({ cost: (r as { costHall?: number }).costHall ?? r.cost, breakdown: r.breakdown }))
  }, [editingId, menuIngredients, effectiveOptionIdForIngredients])

  React.useEffect(() => {
    if (!editingId) return
    getMenuCost({ menuId: editingId }).then((r) => setBaseMenuCost((r as { costHall?: number }).costHall ?? r.cost))
  }, [editingId, menuIngredients])

  const handleExpandMenu = React.useCallback(async (menuId: string) => {
    if (expandedMenuId === menuId) {
      setExpandedMenuId(null)
      setExpandedMenuData(null)
      return
    }
    try {
      const opts = await getPosMenuOptions({ menuId })
      if (!opts || opts.length === 0) {
        return
      }
      setExpandedMenuId(menuId)
      setExpandedMenuData({ options: opts })
    } catch {
      setExpandedMenuData(null)
    }
  }, [expandedMenuId])

  const ADDITIVE_OPTION_CATEGORY = "POS추가옵션"

  const loadItems = React.useCallback(() => {
    getAdminItems()
      .then((list) => setItems((list || []).map((x) => ({ code: x.code, name: x.name, category: x.category || "" }))))
      .catch(() => setItems([]))
  }, [])

  React.useEffect(() => {
    if (editingId) loadItems()
    else setItems([])
  }, [editingId, loadItems])

  React.useEffect(() => {
    if (!optionsConfigSelectedMenuId) {
      setOptionsConfigMenuOptions([])
      return
    }
    getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
    setNewOptionSize("")
    setNewOptionPart("")
    setNewOptionModifier("0")
    setNewOptionModifierDelivery("")
  }, [optionsConfigSelectedMenuId])

  React.useEffect(() => {
    if (mainTab === "optionsConfig" && optionsConfigSelectedMenuId) loadItems()
  }, [mainTab, optionsConfigSelectedMenuId, loadItems])

  const additiveOptionItems = React.useMemo(
    () => items.filter((it) => (it.category || "").trim() === ADDITIVE_OPTION_CATEGORY),
    [items]
  )

  const handleNewRegister = () => {
    setFormData(emptyForm)
    setEditingId(null)
  }

  const handleReset = () => {
    if (editingId) {
      const m = menus.find((x) => x.id === editingId)
      if (m) {
        setFormData({
          code: m.code,
          name: m.name,
          categoryMain: m.categoryMain ?? "",
          category: m.category,
          price: String(m.price),
          priceDelivery: m.priceDelivery != null ? String(m.priceDelivery) : "",
          imageUrl: m.imageUrl,
          vatIncluded: m.vatIncluded,
          isActive: m.isActive,
        })
      }
    } else {
      setFormData(emptyForm)
    }
  }

  const handleSave = async () => {
    const code = formData.code.trim()
    const name = formData.name.trim()
    if (!code || !name) {
      alert(t("posMenuAlertCodeName"))
      return
    }
    if (!editingId && menus.some((m) => m.code === code)) {
      alert(t("itemsAlertCodeExists"))
      return
    }
    const editingMenu = editingId ? menus.find((m) => m.id === editingId) : null
    const res = await savePosMenu({
      id: editingId || undefined,
      code,
      name,
      categoryMain: formData.categoryMain.trim(),
      category: formData.category.trim(),
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null,
      imageUrl: formData.imageUrl.trim(),
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
    })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    const newMenu: PosMenu = {
      id: editingId || "",
      code,
      name,
      categoryMain: formData.categoryMain.trim(),
      category: formData.category.trim(),
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null,
      imageUrl: formData.imageUrl.trim(),
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      sortOrder: 0,
      optionSelectionGroups: editingMenu?.optionSelectionGroups,
    }
    if (editingId) {
      setMenus((prev) => prev.map((m) => (m.id === editingId ? { ...newMenu, id: editingId } : m)))
      alert(t("itemsAlertUpdated"))
    } else {
      getPosMenus().then(setMenus)
      alert(t("itemsAlertSaved"))
    }
    const newCat = formData.category.trim()
    if (newCat && !allCategories.includes(newCat)) {
      setAllCategories((prev) => [...prev, newCat].sort())
    }
    const newMainCat = formData.categoryMain.trim()
    if (newMainCat && !allMainCategories.includes(newMainCat)) {
      setAllMainCategories((prev) => [...prev, newMainCat].sort())
    }
    setFormData(emptyForm)
    setEditingId(null)
  }

  const handleEdit = (menu: PosMenu) => {
    setFormData({
      code: menu.code,
      name: menu.name,
      categoryMain: menu.categoryMain ?? "",
      category: menu.category,
      price: String(menu.price),
      priceDelivery: menu.priceDelivery != null ? String(menu.priceDelivery) : "",
      imageUrl: menu.imageUrl,
      vatIncluded: menu.vatIncluded,
      isActive: menu.isActive,
    })
    setEditingId(menu.id)
    setNewOptionName("")
    setNewOptionModifier("0")
    setNewOptionModifierDelivery("")
    setSelectedIngredientOptionId("")
  }

  const currentMenuGroups: string[] = []
  const handleAddOption = async () => {
    if (!editingId || !newOptionName.trim()) return
    if (newOptionType === "additive" && !newOptionItemCode.trim()) {
      alert(t("posOptionAdditiveItemRequired") || "추가형 옵션은 품목을 선택해야 합니다.")
      return
    }
    if (newOptionType === "substitution" && currentMenuGroups.length > 0) {
      const missing = currentMenuGroups.filter((g) => !(newOptionStepValues[g] ?? "").trim())
      if (missing.length > 0) {
        alert(
          t("posOptionStepValuesRequired") ||
            `옵션 선택 단계가 설정된 메뉴는 대체형 옵션에 모든 단계 값을 입력해야 합니다. (빈 값: ${missing.join(", ")})`
        )
        return
      }
    }
    const optionStepValues =
      newOptionType === "substitution" && currentMenuGroups.length > 0
        ? Object.fromEntries(currentMenuGroups.map((g) => [g, (newOptionStepValues[g] || "").trim()]))
        : undefined
    const res = await savePosMenuOption({
      menuId: Number(editingId),
      name: newOptionName.trim(),
      priceModifier: Number(newOptionModifier) || 0,
      priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
      sortOrder: menuOptions.length,
      optionType: newOptionType,
      itemCode: newOptionType === "additive" ? newOptionItemCode.trim() : null,
      quantity: newOptionType === "additive" ? Number(newOptionQuantity) || 1 : 1,
      optionStepValues,
    })
    if (res.success) {
      getPosMenuOptions({ menuId: editingId }).then(setMenuOptions)
      setNewOptionName("")
      setNewOptionModifier("0")
      setNewOptionModifierDelivery("")
      setNewOptionType("substitution")
      setNewOptionItemCode("")
      setNewOptionQuantity("1")
      setNewOptionStepValues({})
    } else {
      alert(res.message)
    }
  }

  const handleAddIngredient = async () => {
    if (!editingId || !newIngredientCode.trim()) return
    const res = await savePosMenuIngredient({
      menuId: Number(editingId),
      itemCode: newIngredientCode.trim(),
      quantity: Number(newIngredientQty) || 1,
      lossRate: Number(newIngredientLossRate) || 0,
      optionId: effectiveOptionIdForIngredients ? Number(effectiveOptionIdForIngredients) : null,
      ingredientType: newIngredientType,
    })
    if (res.success) {
      getPosMenuIngredients({ menuId: editingId, optionId: effectiveOptionIdForIngredients ?? "null" }).then(setMenuIngredients)
      setNewIngredientCode("")
      setNewIngredientQty("1")
      setNewIngredientLossRate("0")
      setNewIngredientType("food")
    } else {
      alert(res.message)
    }
  }

  const handleDeleteIngredient = async (ing: PosMenuIngredient) => {
    if (!confirm(`${ing.itemCode} ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuIngredient({ id: ing.id })
    if (res.success) {
      setMenuIngredients((prev) => prev.filter((i) => i.id !== ing.id))
    } else {
      alert(res.message)
    }
  }

  const handleDeleteOption = async (opt: PosMenuOption) => {
    if (!confirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      setMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
    } else {
      alert(res.message)
    }
  }

  const optionsConfigSelectedMenu = optionsConfigSelectedMenuId ? menus.find((m) => m.id === optionsConfigSelectedMenuId) : null

  /** 메뉴 옵션 단계가 size, part가 아니면 업데이트 */
  const ensureMenuOptionGroups = React.useCallback(async () => {
    if (!optionsConfigSelectedMenuId || !optionsConfigSelectedMenu) return
    const groups = optionsConfigSelectedMenu.optionSelectionGroups || []
    const hasCorrect = groups.length >= 2 && groups[0] === "size" && groups[1] === "part"
    if (!hasCorrect) {
      const res = await savePosMenu({
        id: optionsConfigSelectedMenuId,
        code: optionsConfigSelectedMenu.code,
        name: optionsConfigSelectedMenu.name,
        category: optionsConfigSelectedMenu.category,
        price: optionsConfigSelectedMenu.price,
        priceDelivery: optionsConfigSelectedMenu.priceDelivery ?? null,
        imageUrl: optionsConfigSelectedMenu.imageUrl ?? "",
        vatIncluded: optionsConfigSelectedMenu.vatIncluded ?? true,
        isActive: optionsConfigSelectedMenu.isActive ?? true,
        optionSelectionGroups: ["size", "part"],
      })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) => (m.id === optionsConfigSelectedMenuId ? { ...m, optionSelectionGroups: ["size", "part"] } : m))
        )
      }
    }
  }, [optionsConfigSelectedMenuId, optionsConfigSelectedMenu])

  const handleAddOptionForConfig = async () => {
    if (!optionsConfigSelectedMenuId || !newOptionSize || !newOptionPart) return
    try {
      await ensureMenuOptionGroups()
      const name = `${newOptionSize} - ${newOptionPart}`
      const optionStepValues = { size: newOptionSize, part: newOptionPart }
      const exists = optionsConfigMenuOptions.some(
        (o) => o.optionStepValues?.size === newOptionSize && o.optionStepValues?.part === newOptionPart
      )
      if (exists) {
        alert(`${name} ${t("itemsAlertCodeExists") || "이미 있습니다."}`)
        return
      }
      const res = await savePosMenuOption({
        menuId: Number(optionsConfigSelectedMenuId),
        name,
        priceModifier: Number(newOptionModifier) || 0,
        priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
        priceModifierPackaging: newOptionModifierPackaging !== "" ? Number(newOptionModifierPackaging) : null,
        sortOrder: optionsConfigMenuOptions.length,
        optionType: "substitution",
        optionStepValues,
        sellHall: true,
        sellDelivery: true,
        sellPackaging: true,
      })
      if (res.success) {
        getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
        setNewOptionSize("")
        setNewOptionPart("")
        setNewOptionModifier("0")
        setNewOptionModifierDelivery("")
        setNewOptionModifierPackaging("")
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      console.error("handleAddOptionForConfig:", e)
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAddAllOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId) return
    await ensureMenuOptionGroups()
    const existingKeys = new Set(
      optionsConfigMenuOptions.map((o) => `${o.optionStepValues?.size ?? ""}_${o.optionStepValues?.part ?? ""}`)
    )
    let added = 0
    for (const size of OPTION_SIZE_VALUES) {
      for (const part of OPTION_PART_VALUES) {
        if (existingKeys.has(`${size}_${part}`)) continue
        const name = `${size} - ${part}`
        const res = await savePosMenuOption({
          menuId: Number(optionsConfigSelectedMenuId),
          name,
          priceModifier: Number(newOptionModifier) || 0,
          priceModifierDelivery: newOptionModifierDelivery !== "" ? Number(newOptionModifierDelivery) : null,
          priceModifierPackaging: newOptionModifierPackaging !== "" ? Number(newOptionModifierPackaging) : null,
          sortOrder: optionsConfigMenuOptions.length + added,
          optionType: "substitution",
          optionStepValues: { size, part },
          sellHall: true,
          sellDelivery: true,
          sellPackaging: true,
        })
        if (res.success) {
          existingKeys.add(`${size}_${part}`)
          added++
        }
      }
    }
    if (added > 0) {
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
    }
  }

  const handleToggleSellChannelForConfig = (opt: PosMenuOption, channel: "sellHall" | "sellDelivery" | "sellPackaging") => {
    const next = !(opt[channel] ?? true)
    setOptionsConfigMenuOptions((prev) =>
      prev.map((o) => (o.id === opt.id ? { ...o, [channel]: next } : o))
    )
  }

  const handlePriceChangeForConfig = (opt: PosMenuOption, field: "priceModifier" | "priceModifierDelivery" | "priceModifierPackaging", value: string) => {
    const num = value === "" ? NaN : Number(value)
    const v = field === "priceModifier" 
      ? (Number.isNaN(num) ? 0 : num) 
      : (Number.isNaN(num) ? null : num)
    setOptionsConfigMenuOptions((prev) =>
      prev.map((o) => (o.id === opt.id ? { ...o, [field]: v } : o))
    )
  }

  const handleSaveOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || optionsConfigMenuOptions.length === 0) return
    try {
      for (const o of optionsConfigMenuOptions) {
        const res = await savePosMenuOption({
          id: o.id,
          menuId: Number(o.menuId),
          name: o.name,
          priceModifier: o.priceModifier ?? 0,
          priceModifierDelivery: o.priceModifierDelivery ?? null,
          priceModifierPackaging: o.priceModifierPackaging ?? null,
          sortOrder: o.sortOrder,
          optionType: o.optionType ?? "substitution",
          optionStepValues: o.optionStepValues ?? undefined,
          sellHall: o.sellHall ?? true,
          sellDelivery: o.sellDelivery ?? true,
          sellPackaging: o.sellPackaging ?? true,
        })
        if (!res.success) {
          alert(res.message)
          return
        }
      }
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
      alert(t("msg_save_success") || "저장되었습니다.")
    } catch (e) {
      console.error("handleSaveOptionsForConfig:", e)
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleResetOptionsForConfig = async () => {
    if (!optionsConfigSelectedMenuId || optionsConfigMenuOptions.length === 0) return
    if (!confirm(t("posMenuOptionsConfigResetConfirm") || "선택한 메뉴의 모든 옵션을 삭제합니다. 계속하시겠습니까?")) return
    try {
      for (const o of optionsConfigMenuOptions) {
        const res = await deletePosMenuOption({ id: o.id })
        if (!res.success) {
          alert(res.message)
          return
        }
      }
      setOptionsConfigMenuOptions([])
      getPosMenuOptions({ menuId: optionsConfigSelectedMenuId }).then(setOptionsConfigMenuOptions)
      alert(t("posMenuOptionsConfigResetDone") || "초기화되었습니다.")
    } catch (e) {
      console.error("handleResetOptionsForConfig:", e)
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDeleteOptionForConfig = async (opt: PosMenuOption) => {
    if (!confirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      setOptionsConfigMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
    } else {
      alert(res.message)
    }
  }

  const handleDelete = async (menu: PosMenu) => {
    if (!confirm(`"${menu.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenu({ id: menu.id })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_delete_fail_detail"))
      return
    }
    setMenus((prev) => prev.filter((m) => m.id !== menu.id))
    if (editingId === menu.id) {
      setFormData(emptyForm)
      setEditingId(null)
    }
    alert(t("itemsAlertDeleted"))
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const handleSoldOutToggle = async (menu: PosMenu) => {
    const isSoldOut = menu.soldOutDate === todayStr
    setSoldOutTogglingId(menu.id)
    try {
      const res = await updatePosMenuSoldOut({ id: menu.id, soldOut: !isSoldOut })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) =>
            m.id === menu.id
              ? { ...m, soldOutDate: !isSoldOut ? todayStr : null }
              : m
          )
        )
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSoldOutTogglingId(null)
    }
  }

  const filteredMenus = React.useMemo(() => {
    return menus.filter((m) => {
      const matchTerm =
        !searchTerm ||
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.code.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCategory = categoryFilter === "all" || m.category === categoryFilter
      const matchMainCategory = mainCategoryFilter === "all" || (m.categoryMain ?? "") === mainCategoryFilter
      return matchTerm && matchCategory && matchMainCategory
    })
  }, [menus, searchTerm, categoryFilter, mainCategoryFilter])

  const optionsConfigFilteredMenus = React.useMemo(() => {
    return menus.filter((m) => {
      const matchTerm =
        !optionsConfigSearchTerm ||
        m.name.toLowerCase().includes(optionsConfigSearchTerm.toLowerCase()) ||
        m.code.toLowerCase().includes(optionsConfigSearchTerm.toLowerCase())
      const matchCategory = optionsConfigCategoryFilter === "all" || m.category === optionsConfigCategoryFilter
      const matchMainCategory = mainCategoryFilter === "all" || (m.categoryMain ?? "") === mainCategoryFilter
      return matchTerm && matchCategory && matchMainCategory
    })
  }, [menus, optionsConfigSearchTerm, optionsConfigCategoryFilter, mainCategoryFilter])

  const categories = React.useMemo(() => {
    const fromMenus = new Set(menus.map((m) => m.category).filter(Boolean))
    const fromDb = new Set(allCategories)
    return Array.from(new Set([...fromDb, ...fromMenus])).sort()
  }, [menus, allCategories])

  const mainCategories = React.useMemo(() => {
    const preset = categoriesConfig?.mainCategories?.length
      ? new Set(categoriesConfig.mainCategories.filter((c): c is string => typeof c === "string"))
      : new Set(POS_MAIN_CATEGORIES)
    const fromMenus = new Set(menus.map((m) => m.categoryMain).filter((c): c is string => typeof c === "string" && c !== ""))
    const fromDb = new Set(allMainCategories)
    return Array.from(new Set([...preset, ...fromDb, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [menus, allMainCategories, categoriesConfig])

  const categoriesByMain = React.useMemo(() => {
    const main = formData.categoryMain?.trim() || null
    if (!main) return categories.filter((c): c is string => typeof c === "string")
    const presetFromConfig = categoriesConfig?.categoriesByMain?.[main]
    const presetFromLib = main in POS_CATEGORIES_BY_MAIN ? POS_CATEGORIES_BY_MAIN[main as keyof typeof POS_CATEGORIES_BY_MAIN] : null
    const preset = presetFromConfig?.length ? presetFromConfig : (presetFromLib ?? [])
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    return Array.from(new Set([...preset, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [formData.categoryMain, menus, categories, categoriesConfig])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("posMenuMgmt")}</h1>
            <p className="text-xs text-muted-foreground">{t("posMenuMgmtSub")}</p>
          </div>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="w-full">
          <TabsList className="mb-4 h-9">
            <TabsTrigger value="screen" className="gap-1.5 text-xs"><LayoutGrid className="h-3.5 w-3.5" />{t("posMenuTabScreen")}</TabsTrigger>
            <TabsTrigger value="optionsConfig" className="gap-1.5 text-xs"><Layers className="h-3.5 w-3.5" />{t("posMenuTabOptionsConfig")}</TabsTrigger>
            <TabsTrigger value="categories" className="gap-1.5 text-xs"><FolderTree className="h-3.5 w-3.5" />{t("posMenuTabCategories")}</TabsTrigger>
            <TabsTrigger value="topping" className="gap-1.5 text-xs"><Pizza className="h-3.5 w-3.5" />{t("posMenuTabTopping")}</TabsTrigger>
            <TabsTrigger value="set" className="gap-1.5 text-xs"><Monitor className="h-3.5 w-3.5" />{t("posMenuTabSet")}</TabsTrigger>
            <TabsTrigger value="menuBoard" className="gap-1.5 text-xs"><Settings2 className="h-3.5 w-3.5" />{t("posMenuTabMenuBoard")}</TabsTrigger>
          </TabsList>
          <TabsContent value="screen" className="mt-0">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Form */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-sm font-bold text-card-foreground">{t("posMenuFormTitle")}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {editingId ? t("itemsFormEditDesc") : t("itemsFormNewDesc")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px]" onClick={handleNewRegister}>
                <FilePlus className="h-3.5 w-3.5" />
                {t("itemsBtnNewRegister")}
              </Button>
            </div>
            <div className="flex flex-col gap-4 p-6">
              {editingId ? (
                <>
                <Tabs value={formTab} onValueChange={(v) => setFormTab(v as typeof formTab)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="info" className="text-xs">{t("posFormTabInfo") || "메뉴정보"}</TabsTrigger>
                    <TabsTrigger value="options" className="text-xs">{t("posFormTabOptions") || "옵션"}</TabsTrigger>
                    <TabsTrigger value="cost" className="text-xs">{t("posFormTabCost") || "원가"}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="info" className="space-y-4 mt-4">
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuCode")}</label>
                      <Input placeholder="M001" className="mt-1 h-10" value={formData.code} onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))} disabled />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuName")}</label>
                      <Input placeholder={t("itemsNamePh")} className="mt-1 h-10" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuCategoryMain")}</label>
                      <Select value={formData.categoryMain || "_"} onValueChange={(v) => setFormData((p) => ({ ...p, categoryMain: v === "_" ? "" : v }))}>
                        <SelectTrigger className="mt-1 h-10">
                          <SelectValue placeholder={t("posMenuCategoryMain")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">-</SelectItem>
                          {mainCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
                      <Select value={formData.category || "_"} onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "_" ? "" : v }))}>
                        <SelectTrigger className="mt-1 h-10">
                          <SelectValue placeholder={t("itemsCategoryPh")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">-</SelectItem>
                          {categoriesByMain.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                        <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                        <Input type="number" placeholder="홀과 동일" className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={formData.vatIncluded} onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))} />
                        {t("posMenuVatIncluded")}
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} />
                        {t("posMenuActive")}
                      </label>
                    </div>
                    <div className="rounded border border-dashed border-primary/30 bg-muted/20 p-3">
                      <h4 className="text-xs font-semibold text-muted-foreground">{t("posMenuOptions") || "옵션"}</h4>
                      {menuOptions.length > 0 ? (
                        <ul className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                          {menuOptions.map((o) => (
                            <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                              <span>{o.name}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {(o.priceModifier ?? 0) !== 0 ? `+${o.priceModifier}` : "-"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">{t("posMenuOptionsSelectHint") || "옵션 구성 탭에서 사이즈, 부위를 추가해 주세요."}</p>
                      )}
                      <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => { setFormTab("options"); setMainTab("optionsConfig"); setOptionsConfigSelectedMenuId(editingId); }}>{t("posMenuTabOptionsConfig") || "옵션 구성"}</Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="options" className="mt-4">
                    <div className="rounded border border-dashed p-3">
                      <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 (반반, 뼈/순살 등)"}</h4>
                      <ul className="mb-2 space-y-1">
                        {menuOptions.map((o) => (
                          <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                            <span>
                              <span className={o.optionType === "additive" ? "text-amber-600" : ""}>{o.name}</span>
                              {o.optionType === "additive" && o.itemCode && (
                                <span className="ml-1 text-muted-foreground">+{o.itemCode}×{o.quantity ?? 1}</span>
                              )}
                              {o.optionType === "substitution" && o.optionStepValues && Object.keys(o.optionStepValues).length > 0 && (
                                <span className="ml-1 text-muted-foreground">({Object.entries(o.optionStepValues).map(([k, v]) => `${k}:${v}`).join(" / ")})</span>
                              )}
                              {(o.priceModifier ?? 0) !== 0 || (o.priceModifierDelivery ?? o.priceModifier ?? 0) !== 0
                                ? ` (홀 ${(o.priceModifier ?? 0) >= 0 ? "+" : ""}${o.priceModifier ?? 0} / 배달 ${(o.priceModifierDelivery ?? o.priceModifier ?? 0) >= 0 ? "+" : ""}${o.priceModifierDelivery ?? o.priceModifier ?? 0} ฿)` : ""}
                            </span>
                            <Button size="sm" variant="ghost" className="h-5 px-1 text-destructive hover:text-destructive" onClick={() => handleDeleteOption(o)}><Trash2 className="h-3 w-3" /></Button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Input placeholder={t("posOptionNamePh") || "옵션명"} className="h-8 text-xs flex-1" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} />
                          <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleAddOption}><Plus className="h-3.5 w-3.5" /></Button>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-muted-foreground shrink-0">{t("posOptionType") || "타입"}</span>
                          <Select value={newOptionType} onValueChange={(v) => setNewOptionType(v as "substitution" | "additive")}>
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="substitution">{t("posOptionTypeSubstitution") || "대체형"}</SelectItem>
                              <SelectItem value="additive">{t("posOptionTypeAdditive") || "추가형"}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {newOptionType === "substitution" && currentMenuGroups.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {currentMenuGroups.map((g) => (
                              <div key={g} className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{g}</span>
                                <Input
                                  placeholder={g}
                                  className="h-8 w-24 text-xs"
                                  value={newOptionStepValues[g] ?? ""}
                                  onChange={(e) => setNewOptionStepValues((p) => ({ ...p, [g]: e.target.value }))}
                                />
                              </div>
                            ))}
                            <p className="text-[10px] text-muted-foreground w-full">예: size=M, bone=순살</p>
                          </div>
                        )}
                        {newOptionType === "additive" && (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <Select value={newOptionItemCode} onValueChange={setNewOptionItemCode}>
                                <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                                  <SelectValue placeholder={t("posOptionAdditiveItem") || "추가 품목"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {additiveOptionItems.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Input type="number" min={0.001} step={0.1} placeholder="1" className="h-8 w-16 text-right text-xs" value={newOptionQuantity} onChange={(e) => setNewOptionQuantity(e.target.value)} />
                            </div>
                            <p className="text-[10px] text-muted-foreground">{t("posAdditiveOptionCategoryHint") || "품목 관리에서 카테고리를 'POS추가옵션'으로 설정한 품목만 선택할 수 있습니다."}</p>
                          </div>
                        )}
                        <div className="flex gap-2 text-xs">
                          <span className="shrink-0 py-2 text-muted-foreground w-16">{t("posOptionModifierHall")}</span>
                          <Input type="number" placeholder="+0" className="h-8 w-20 text-right text-xs" value={newOptionModifier} onChange={(e) => setNewOptionModifier(e.target.value)} />
                          <span className="shrink-0 py-2 text-muted-foreground w-20">{t("posOptionModifierDelivery")}</span>
                          <Input type="number" placeholder="홀과 동일" className="h-8 w-20 text-right text-xs" value={newOptionModifierDelivery} onChange={(e) => setNewOptionModifierDelivery(e.target.value)} />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                  <TabsContent value="cost" className="mt-4">
                    {menuOptions.some((o) => o.optionType === "substitution") && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground shrink-0">{t("posIngredientScope") || "재료 범위"}</span>
                        <Select value={selectedIngredientOptionId || "base"} onValueChange={(v) => setSelectedIngredientOptionId(v === "base" ? "" : v)}>
                          <SelectTrigger className="h-8 w-40 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="base">{t("posIngredientScopeBase") || "기본 (옵션 없음)"}</SelectItem>
                            {menuOptions.filter((o) => o.optionType === "substitution").map((o) => (
                              <SelectItem key={o.id} value={o.id}>{t("posIngredientScopeOption") || "옵션"}: {o.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="rounded border border-dashed border-amber-500/50 p-3">
                      <h4 className="mb-2 text-xs font-semibold">
                        {selectedIngredientOptionId ? `${t("posIngredientScopeOption") || "옵션"}: ${menuOptions.find((o) => o.id === selectedIngredientOptionId)?.name ?? ""}` : t("posMenuIngredients") || "재료 (BOM)"}
                      </h4>
                      <ul className="mb-2 max-h-48 overflow-y-auto space-y-1">
                        {menuIngredients.map((ing) => (
                          <li key={ing.id} className="flex items-center justify-between rounded bg-amber-500/10 px-2 py-1 text-xs">
                            <span>
                              {ing.itemCode} × {ing.quantity}{(ing.lossRate ?? 0) > 0 ? ` (로스 ${ing.lossRate}%)` : ""}
                              {ing.ingredientType === "packaging" && <span className="ml-1 text-amber-600">[포장]</span>}
                            </span>
                            <Button size="sm" variant="ghost" className="h-5 px-1 text-destructive hover:text-destructive" onClick={() => handleDeleteIngredient(ing)}><Trash2 className="h-3 w-3" /></Button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <Select value={newIngredientType} onValueChange={(v) => setNewIngredientType(v as "food" | "packaging")}>
                          <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="food">{t("posCostTypeFood") || "음식"}</SelectItem>
                            <SelectItem value="packaging">{t("posCostTypePackaging") || "포장"}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={newIngredientCode} onValueChange={setNewIngredientCode}>
                          <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                            <SelectValue placeholder={t("posIngredientPh") || "재료 선택"} />
                          </SelectTrigger>
                          <SelectContent>
                            {items.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={0.001} step={0.1} placeholder="1" className="h-8 w-16 text-right text-xs" value={newIngredientQty} onChange={(e) => setNewIngredientQty(e.target.value)} />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground shrink-0">{t("posIngredientLoss") || "로스"}</span>
                          <Input type="number" min={0} max={100} step={0.5} placeholder="0" className="h-8 w-14 text-right text-xs" value={newIngredientLossRate} onChange={(e) => setNewIngredientLossRate(e.target.value)} />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                        <Button size="sm" className="h-8 px-2" onClick={handleAddIngredient}><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{t("posIngredientHint") || "판매 시 해당 재료가 자동 차감됩니다."}</p>
                    </div>
                    {menuCost != null && menuCost.breakdown.length > 0 && (
                      <div className="rounded border bg-muted/30 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-3 py-2 text-left font-semibold">{t("posMenuIngredients") || "재료"}</th>
                              <th className="px-3 py-2 text-right font-semibold">수량</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("posIngredientLoss") || "로스"}</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("posMenuCost") || "원가"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {menuCost.breakdown.map((b) => (
                              <tr key={b.itemCode} className="border-b last:border-b-0">
                                <td className="px-3 py-2">{b.itemName}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{(b.lossRate ?? 0) > 0 ? `${b.lossRate}%` : "-"}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium">{b.costTotal.toFixed(1)} ฿</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-between items-center border-t bg-muted/30 px-3 py-2">
                          <span className="text-xs font-semibold">{t("posMenuCost") || "총 원가"}</span>
                          <span className="font-bold tabular-nums">{menuCost.cost.toFixed(1)} ฿</span>
                        </div>
                        {(Number(formData.price) || 0) > 0 && (
                          <div className="flex justify-between items-center border-t px-3 py-2">
                            <span className="text-xs font-semibold">{t("posMenuCostRatio") || "원가율"}</span>
                            <span className="font-bold text-amber-600 tabular-nums">{((menuCost.cost / (Number(formData.price) || 1)) * 100).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    )}
                    {baseMenuCost != null && (Number(formData.price) || 0) > 0 && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                        <span className="text-xs text-muted-foreground">{t("posMenuCostRatio") || "최종 원가율"}</span>
                        <span className="ml-2 text-lg font-bold text-amber-600">
                          {((baseMenuCost / (Number(formData.price) || 1)) * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                    <div className="flex gap-3 pt-2">
                      <Button className="flex-1" onClick={handleSave}><Save className="mr-2 h-4 w-4" />{t("itemsBtnSave")}</Button>
                      <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" />{t("itemsBtnReset")}</Button>
                    </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuCode")}</label>
                    <Input placeholder="M001" className="mt-1 h-10" value={formData.code} onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuName")}</label>
                    <Input placeholder={t("itemsNamePh")} className="mt-1 h-10" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuCategoryMain")}</label>
                    <Select value={formData.categoryMain || "_"} onValueChange={(v) => setFormData((p) => ({ ...p, categoryMain: v === "_" ? "" : v }))}>
                      <SelectTrigger className="mt-1 h-10">
                        <SelectValue placeholder={t("posMenuCategoryMain")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">-</SelectItem>
                        {mainCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
                    <Select value={formData.category || "_"} onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "_" ? "" : v }))}>
                      <SelectTrigger className="mt-1 h-10">
                        <SelectValue placeholder={t("itemsCategoryPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">-</SelectItem>
                        {categoriesByMain.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                      <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                      <Input type="number" placeholder="홀과 동일" className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={formData.vatIncluded} onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))} />
                      {t("posMenuVatIncluded")}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} />
                      {t("posMenuActive")}
                    </label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button className="flex-1" onClick={handleSave}><Save className="mr-2 h-4 w-4" />{t("itemsBtnSave")}</Button>
                    <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" />{t("itemsBtnReset")}</Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
              <h3 className="text-sm font-bold">{t("posMenuList") || "메뉴 목록"}</h3>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={async () => { setRefreshLoading(true); try { const [list, { categories, mainCategories }, config] = await Promise.all([getPosMenus(), getPosMenuCategories(), getPosMenuCategoriesConfig()]); setMenus(list || []); setAllCategories(categories || []); setAllMainCategories(mainCategories || []); setCategoriesConfig(config || null); } finally { setRefreshLoading(false); } }} disabled={refreshLoading}>
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshLoading && "animate-spin")} />
                {t("btn_query") || t("stockBtnSearch") || "조회"}
              </Button>
            </div>
            <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-3">
              <Select value={mainCategoryFilter} onValueChange={setMainCategoryFilter}>
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder={t("posMenuCategoryMain")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                  {mainCategories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("itemsSearchPh")}
                className="h-9 flex-1 text-xs"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-2 py-3 text-[11px] font-bold text-center w-8"></th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("itemsColCode")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[140px]">{t("posMenuName")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posMenuCategoryMain")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuCategory")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuPriceCol") || "가격"}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-28">{t("itemsColAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMenus.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        {t("itemsNoResults")}
                      </td>
                    </tr>
                  ) : (
                    filteredMenus.map((m, idx) => {
                      const isSoldOutToday = m.soldOutDate === todayStr
                      const isExpanded = expandedMenuId === m.id
                      const expanded = isExpanded ? expandedMenuData : null
                      return (
                      <React.Fragment key={m.id}>
                      <tr
                        className={cn(
                          "border-b hover:bg-muted/20 cursor-pointer",
                          idx % 2 === 1 && "bg-muted/5"
                        )}
                        onClick={() => handleExpandMenu(m.id)}
                      >
                        <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleExpandMenu(m.id)}>
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </Button>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {m.code}
                          </span>
                        </td>
                        <td className="px-5 py-3">{m.name}</td>
                        <td className="px-5 py-3 text-center text-muted-foreground text-xs">{m.categoryMain || "-"}</td>
                        <td className="px-5 py-3 text-center text-muted-foreground">{m.category || "-"}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-xs">
                          {m.price > 0 ? m.price.toLocaleString() : "-"}
                        </td>
                        <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                isSoldOutToday
                                  ? "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                  : "text-muted-foreground border-muted hover:bg-muted/50"
                              )}
                              onClick={() => handleSoldOutToggle(m)}
                              disabled={soldOutTogglingId === m.id || !m.isActive}
                              title={soldOutTogglingId === m.id ? "..." : isSoldOutToday ? (t("posSoldOut") || "품절") : (t("posAvailable") || "판매")}
                            >
                              {soldOutTogglingId === m.id ? (
                                <span className="text-[10px]">...</span>
                              ) : isSoldOutToday ? (
                                <PauseCircle className="h-3.5 w-3.5" />
                              ) : (
                                <PlayCircle className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleEdit(m)}
                              title={t("itemsBtnEdit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDelete(m)}
                              title={t("itemsBtnDelete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && expanded && expanded.options.length > 0 && (
                        <tr className="bg-amber-500/5 border-b">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
                              <ul className="space-y-1 max-h-48 overflow-y-auto">
                                {[...expanded.options].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((opt, i) => {
                                  const optCode = `${m.code}-${String(i + 1).padStart(2, "0")}`
                                  const optPrice = (m.price ?? 0) + (opt.priceModifier ?? 0)
                                  return (
                                    <li key={opt.id} className="flex justify-between items-center text-xs">
                                      <span className="font-medium">{optCode}</span>
                                      <span>{opt.name}</span>
                                      <span className="tabular-nums text-amber-600 font-medium">{optPrice.toLocaleString()} ฿</span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
          </TabsContent>
          <TabsContent value="optionsConfig" className="mt-0">
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* 좌측: 메뉴 리스트 */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="border-b px-4 py-3 bg-muted/20">
                  <h3 className="text-sm font-bold">{t("posMenuList")}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t("posMenuOptionsConfigSelectHint") || "메뉴를 선택하면 옵션을 구성할 수 있습니다"}</p>
                </div>
                <div className="p-3 space-y-2 border-b">
                  <Select value={mainCategoryFilter} onValueChange={setMainCategoryFilter}>
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder={t("posMenuCategoryMain")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                      {mainCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={optionsConfigCategoryFilter} onValueChange={setOptionsConfigCategoryFilter}>
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={optionsConfigSearchTerm}
                    onChange={(e) => setOptionsConfigSearchTerm(e.target.value)}
                    placeholder={t("itemsSearchPh")}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="max-h-[400px] overflow-y-auto p-2">
                  {optionsConfigFilteredMenus.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">{t("itemsNoResults")}</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {optionsConfigFilteredMenus.map((m) => {
                        const isSelected = optionsConfigSelectedMenuId === m.id
                        const optCount = isSelected ? optionsConfigMenuOptions.length : null
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              className={cn(
                                "w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors",
                                isSelected ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/60"
                              )}
                              onClick={() => setOptionsConfigSelectedMenuId(m.id)}
                            >
                              <span className="font-medium">{m.code}</span>
                              <span className="text-muted-foreground ml-1">—</span>
                              <span className={isSelected ? "text-primary-foreground/90" : ""}>{m.name}</span>
                              {optCount != null && optCount > 0 && (
                                <span className={cn("ml-1.5", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>({optCount})</span>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
              {/* 우측: 옵션 설정 패널 */}
              <div className="rounded-xl border bg-card overflow-hidden">
                {!optionsConfigSelectedMenuId ? (
                  <div className="p-12 text-center">
                    <p className="text-sm text-muted-foreground">{t("posMenuOptionsConfigNoSelect") || "왼쪽에서 메뉴를 선택해 주세요"}</p>
                  </div>
                ) : (
                  <div className="p-6">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-bold">{optionsConfigSelectedMenu?.name} ({optionsConfigSelectedMenu?.code})</h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          1. {t("posOptionGroupSize") || "사이즈"} (S, M, L) → 2. {t("posOptionGroupPart") || "부위"} (순살, 윙, 봉)
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleResetOptionsForConfig} disabled={optionsConfigMenuOptions.length === 0}><RotateCcw className="h-3.5 w-3.5 mr-1" />{t("posMenuOptionsConfigReset") || "초기화"}</Button>
                        <Button size="sm" className="h-8 text-xs" onClick={handleSaveOptionsForConfig} disabled={optionsConfigMenuOptions.length === 0}><Save className="h-3.5 w-3.5 mr-1" />{t("save") || "저장"}</Button>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {/* 옵션 추가: 1단계 사이즈 + 2단계 부위 */}
                      <div className="rounded border p-3 bg-muted/20">
                        <div className="flex flex-wrap gap-2 items-end">
                          <div>
                            <label className="text-xs font-medium block mb-0.5">1. {t("posOptionGroupSize")}</label>
                            <Select value={newOptionSize || "_"} onValueChange={(v) => setNewOptionSize(v === "_" ? "" : v)}>
                              <SelectTrigger className="h-8 w-20 text-xs">
                                <SelectValue placeholder="S/M/L" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                                {OPTION_SIZE_VALUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium block mb-0.5">2. {t("posOptionGroupPart")}</label>
                            <Select value={newOptionPart || "_"} onValueChange={(v) => setNewOptionPart(v === "_" ? "" : v)}>
                              <SelectTrigger className="h-8 w-24 text-xs">
                                <SelectValue placeholder={t("posOptionPartPlaceholder") || "순살/윙/봉"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                                {OPTION_PART_VALUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-wrap gap-2 items-end">
                            <div className="flex gap-2">
                              <div>
                                <div className="text-xs font-medium mb-0.5">{t("posOptionSellHall")}</div>
                                <Input type="number" placeholder="0" className="h-8 w-24 text-right text-xs" value={newOptionModifier} onChange={(e) => setNewOptionModifier(e.target.value)} />
                              </div>
                              <div>
                                <div className="text-xs font-medium mb-0.5">{t("posOptionSellPackaging")}</div>
                                <Input type="number" placeholder="-" className="h-8 w-24 text-right text-xs" value={newOptionModifierPackaging} onChange={(e) => setNewOptionModifierPackaging(e.target.value)} />
                              </div>
                              <div>
                                <div className="text-xs font-medium mb-0.5">{t("posOptionSellDelivery")}</div>
                                <Input type="number" placeholder="-" className="h-8 w-24 text-right text-xs" value={newOptionModifierDelivery} onChange={(e) => setNewOptionModifierDelivery(e.target.value)} />
                              </div>
                            </div>
                            <Button size="sm" className="h-8 px-3" onClick={handleAddOptionForConfig} disabled={!newOptionSize || !newOptionPart} type="button"><Plus className="h-3.5 w-3.5 mr-1" /></Button>
                            <Button variant="outline" size="sm" className="h-8" onClick={handleAddAllOptionsForConfig}>{t("posOptionAddAll")}</Button>
                          </div>
                        </div>
                      </div>
                      {/* 옵션 목록: 각 행에 홀/배달/포장 체크박스 */}
                      <div className="rounded border p-3">
                        <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 목록"}</h4>
                        <div className="max-h-60 overflow-y-auto">
                          {optionsConfigMenuOptions.length === 0 ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">{t("posOptionsConfigEmptyOptions") || "위에서 옵션을 추가해 주세요."}</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-muted-foreground">
                                  <th className="text-left py-2 px-2 font-medium">{t("posOptionsConfigOptionCol") || "옵션"}</th>
                                  <th className="text-center py-2 px-2 w-20">{t("posOptionSellHall")}</th>
                                  <th className="text-center py-2 px-2 w-20">{t("posOptionSellDelivery")}</th>
                                  <th className="text-center py-2 px-2 w-20">{t("posOptionSellPackaging")}</th>
                                  <th className="text-right py-2 px-2 w-24 text-xs font-medium">{t("posOptionSellHall")}</th>
                                  <th className="text-right py-2 px-2 w-24 text-xs font-medium">{t("posOptionSellPackaging")}</th>
                                  <th className="text-right py-2 px-2 w-24 text-xs font-medium">{t("posOptionSellDelivery")}</th>
                                  <th className="w-8"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {optionsConfigMenuOptions.map((o) => (
                                  <tr key={o.id} className="border-b last:border-b-0">
                                    <td className="py-2 px-2 font-medium">{o.name}</td>
                                    <td className="py-2 px-2 text-center">
                                      <Checkbox checked={o.sellHall !== false} onCheckedChange={() => handleToggleSellChannelForConfig(o, "sellHall")} />
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <Checkbox checked={o.sellDelivery !== false} onCheckedChange={() => handleToggleSellChannelForConfig(o, "sellDelivery")} />
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <Checkbox checked={o.sellPackaging !== false} onCheckedChange={() => handleToggleSellChannelForConfig(o, "sellPackaging")} />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Input type="number" className="h-7 w-24 text-right text-xs tabular-nums" value={o.priceModifier != null ? o.priceModifier : ""} onChange={(e) => handlePriceChangeForConfig(o, "priceModifier", e.target.value)} placeholder="0" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Input type="number" className="h-7 w-24 text-right text-xs tabular-nums" value={o.priceModifierPackaging ?? ""} onChange={(e) => handlePriceChangeForConfig(o, "priceModifierPackaging", e.target.value)} placeholder="-" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Input type="number" className="h-7 w-24 text-right text-xs tabular-nums" value={o.priceModifierDelivery ?? ""} onChange={(e) => handlePriceChangeForConfig(o, "priceModifierDelivery", e.target.value)} placeholder="-" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleDeleteOptionForConfig(o)}><Trash2 className="h-3 w-3" /></Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="categories" className="mt-0">
            <CategoriesTab
              config={categoriesConfig}
              onSave={async (next, applyToMenus) => {
                setCategoriesConfigSaving(true)
                try {
                  const res = await savePosMenuCategoriesConfig({ ...next, applyToMenus })
                  if (res?.success) {
                    setCategoriesConfig({ mainCategories: res.mainCategories, categoriesByMain: res.categoriesByMain })
                    if ((res.menusUpdated ?? 0) > 0) {
                      const list = await getPosMenus()
                      setMenus(list || [])
                    }
                  }
                } finally {
                  setCategoriesConfigSaving(false)
                }
              }}
              saving={categoriesConfigSaving}
              t={t}
            />
          </TabsContent>
          <TabsContent value="topping" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">{t("posToppingPlaceholder") || "토핑 관리 (준비 중)"}</p>
            </div>
          </TabsContent>
          <TabsContent value="set" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">{t("posSetPlaceholder") || "세트 메뉴 관리 (준비 중)"}</p>
            </div>
          </TabsContent>
          <TabsContent value="menuBoard" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">{t("posMenuBoardPlaceholder") || "메뉴판 미리보기 (준비 중)"}</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
