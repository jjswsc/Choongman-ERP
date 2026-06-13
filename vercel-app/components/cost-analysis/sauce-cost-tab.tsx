"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Search, X, ExternalLink, ShoppingBag, Warehouse } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getSauces, saveSauce, deleteSauce, recalculateSauces, getAdminItems, type SauceRow, type AdminItem } from "@/lib/api-client"
import { getIngredientCodeByItemCode, getIngredientItemCode, MISE_DEFAULT } from "@/lib/cost-data"
import { syncCostAnalysisRuntime } from "@/lib/cost-analysis-runtime"
import type { RecipeItem } from "@/lib/cost-data"
import { IngredientTable } from "@/components/cost-analysis/ingredient-table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

const STANDARD_SAUCE_UNITS = ["g", "ml", "kg"] as const
/** 신규 배합 추가 시 폼에 넣을 기본 OH% (메뉴별 OH는 원가 계산기 등에서 설정) */
const DEFAULT_NEW_SAUCE_OVERHEAD_PERCENT = 5

/** Select value는 목록에 없으면 Radix가 동작하지 않음. 표준 단위는 소문자로 통일. */
function canonicalSauceFormUnit(unit: string | undefined): string {
  const raw = (unit ?? "g").trim()
  if (!raw) return "g"
  const lower = raw.toLowerCase()
  if ((STANDARD_SAUCE_UNITS as readonly string[]).includes(lower)) return lower
  return raw
}

/** 판매용 전환 시: 품목명이 배합명과 동일(대소문자 무시)하거나 품목코드=배합코드가 딱 1건일 때만 자동 연결 제안 */
function suggestLinkedItemCodeForForSaleBlend(
  itemList: AdminItem[],
  blendName: string,
  blendCode: string
): string | null {
  const nameLc = blendName.trim().toLowerCase()
  const codeTrim = String(blendCode ?? "").trim()
  if (nameLc) {
    const byName = itemList.filter((i) => String(i.name ?? "").trim().toLowerCase() === nameLc)
    if (byName.length === 1) {
      const c = String(byName[0].code ?? "").trim()
      return c || null
    }
  }
  if (codeTrim) {
    const byCode = itemList.filter((i) => String(i.code ?? "").trim() === codeTrim)
    if (byCode.length === 1) {
      const c = String(byCode[0].code ?? "").trim()
      return c || null
    }
  }
  return null
}

export function SauceCostTab({ canEdit = true }: { canEdit?: boolean }) {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const [sauces, setSauces] = React.useState<SauceRow[]>([])
  const [items, setItems] = React.useState<AdminItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [listQueried, setListQueried] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  /** 목록 필터: 전체 / 판매용 / 매장용 */
  const [listUsageFilter, setListUsageFilter] = React.useState<"all" | "for_sale" | "store_use">("all")
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saveLoading, setSaveLoading] = React.useState(false)
  /** 검색 전 「배합 추가」 클릭 시 목록·품목 선로드 */
  const [addOpenLoading, setAddOpenLoading] = React.useState(false)
  const [recalcLoading, setRecalcLoading] = React.useState(false)
  const [recalcAffected, setRecalcAffected] = React.useState<number | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SauceRow | null>(null)
  const [formCode, setFormCode] = React.useState("")
  const [formName, setFormName] = React.useState("")
  const [formUnit, setFormUnit] = React.useState("g")
  const [formOh, setFormOh] = React.useState(5)
  const [formOhStr, setFormOhStr] = React.useState("5")
  const [formTotalQuantity, setFormTotalQuantity] = React.useState<number>(0)
  const [formFoodItems, setFormFoodItems] = React.useState<RecipeItem[]>([])
  const [formUsageKind, setFormUsageKind] = React.useState<'for_sale' | 'store_use'>('for_sale')
  const [formLinkedItemCode, setFormLinkedItemCode] = React.useState('')
  const [linkedItemFilterSearch, setLinkedItemFilterSearch] = React.useState("")
  const [linkedItemFilterCategory, setLinkedItemFilterCategory] = React.useState<string>("all")
  const linkedItemSearchInputRef = React.useRef<HTMLInputElement>(null)
  const linkedItemSectionRef = React.useRef<HTMLDivElement>(null)

  const unitSelectValues = React.useMemo(() => {
    const u = (formUnit.trim() || "g")
    if ((STANDARD_SAUCE_UNITS as readonly string[]).includes(u)) {
      return [...STANDARD_SAUCE_UNITS]
    }
    return [...STANDARD_SAUCE_UNITS, u]
  }, [formUnit])

  const load = React.useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      /** 배합 목록은 단독 조회 — 품목/OH API 실패로 전체가 막히지 않게 함 */
      const sauceList = await getSauces()
      setSauces(sauceList || [])
      setListQueried(true)

      const itemList = await getAdminItems().catch(() => [] as AdminItem[])
      setItems(Array.isArray(itemList) ? itemList : [])
    } catch (e) {
      setSauces([])
      setItems([])
      setLoadError(String(e))
      setListQueried(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const displaySauces = React.useMemo(() => {
    let list = sauces
    if (listUsageFilter === "for_sale") {
      list = list.filter((s) => (s.usageKind ?? "for_sale") !== "store_use")
    } else if (listUsageFilter === "store_use") {
      list = list.filter((s) => s.usageKind === "store_use")
    }
    const q = searchTerm.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (s) =>
        String(s.code ?? "").toLowerCase().includes(q) ||
        String(s.name ?? "").toLowerCase().includes(q)
    )
  }, [sauces, searchTerm, listUsageFilter])

  const getNextSauceCode = React.useCallback((list: SauceRow[]) => {
    const match = /^S(\d+)$/i
    let max = 0
    for (const s of list) {
      const m = String(s.code ?? "").match(match)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `S${String(max + 1).padStart(3, "0")}`
  }, [])

  const handleNew = async () => {
    setEditing(null)
    let sauceList = sauces
    let itemList = items
    const oh = DEFAULT_NEW_SAUCE_OVERHEAD_PERCENT
    if (!listQueried) {
      setAddOpenLoading(true)
      try {
        const sl = await getSauces()
        sauceList = sl || []
        setSauces(sauceList)
        setListQueried(true)
        const il = await getAdminItems().catch(() => [] as AdminItem[])
        itemList = Array.isArray(il) ? il : []
        setItems(itemList)
      } catch (e) {
        setSauces([])
        setItems([])
        setListQueried(false)
        await appAlert(String(e))
        return
      } finally {
        setAddOpenLoading(false)
      }
    }
    setFormCode(getNextSauceCode(sauceList))
    setFormName("")
    setFormUnit("g")
    setFormOh(oh)
    setFormOhStr(String(oh))
    setFormTotalQuantity(0)
    setFormFoodItems([])
    setFormUsageKind("for_sale")
    setFormLinkedItemCode("")
    await syncCostAnalysisRuntime("full")
    setEditOpen(true)
  }

  const handleEdit = (s: SauceRow) => {
    setEditing(s)
    setFormCode(s.code)
    setFormName(s.name)
    setFormUnit(canonicalSauceFormUnit(s.unit))
    setFormOh(s.overheadPercent)
    setFormOhStr(String(s.overheadPercent))
    setFormTotalQuantity(s.totalQuantity ?? s.ingredients.reduce((sum, i) => sum + i.quantity, 0))
    setFormUsageKind(s.usageKind === "store_use" ? "store_use" : "for_sale")
    setFormLinkedItemCode(s.linkedItemCode ?? "")
    void syncCostAnalysisRuntime("full").then(() => {
      const foodItems = s.ingredients
        .map((i): RecipeItem | null => {
          const code = getIngredientCodeByItemCode(i.itemCode)
          if (code == null) return null
          return { ingredientCode: code, quantity: i.quantity, misePercent: i.lossRate ?? MISE_DEFAULT }
        })
        .filter((x): x is RecipeItem => x != null)
      setFormFoodItems(foodItems)
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    const code = formCode.trim()
    const name = formName.trim()
    if (!code || !name) {
      await appAlert(t("posCostSauceCodeNameRequired") || "코드와 이름이 필요합니다.")
      return
    }
    if (formUsageKind === "for_sale" && !formLinkedItemCode.trim()) {
      const detailKo =
        "판매용은 품목 관리에 등록된 품목과 반드시 연결해야 합니다.\n\n아래 「연결 품목」에서 해당 품목을 선택한 뒤 다시 저장해 주세요.\n(배합 이름과 품목 이름이 같거나, 배합 코드와 품목 코드가 같으면 「판매용」을 누를 때 자동으로 채워질 수 있습니다.)"
      const detailEn = `${t("posCostSauceForSaleRequiresLinked")}\n\nChoose the linked item in the field below, then save again.\n(If the blend name matches exactly one item name, or blend code matches one item code, choosing For sale may auto-fill the link.)`
      await appAlert(lang === "ko" ? detailKo : detailEn)
      window.setTimeout(() => {
        linkedItemSectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
        linkedItemSearchInputRef.current?.focus()
      }, 100)
      return
    }
    const ingredients = formFoodItems.map((r) => {
      const itemCode = getIngredientItemCode(r.ingredientCode)
      return { itemCode: itemCode ?? "", quantity: r.quantity, lossRate: r.misePercent ?? MISE_DEFAULT }
    }).filter((i) => i.itemCode.trim())
    const ohNum = parseFloat(formOhStr)
    const overheadVal = !isNaN(ohNum) && ohNum >= 0 && ohNum <= 50 ? ohNum : 5
    setSaveLoading(true)
    try {
      await saveSauce({
        id: editing?.id,
        code,
        name,
        unit: formUnit,
        overheadPercent: overheadVal,
        totalQuantity: formTotalQuantity >= 0 ? formTotalQuantity : undefined,
        ingredients,
        usageKind: formUsageKind,
        linkedItemCode: formUsageKind === "for_sale" ? formLinkedItemCode.trim() : undefined,
      })
      const recalcRes = await recalculateSauces()
      if (recalcRes.affectedMenuCount != null) {
        setRecalcAffected(recalcRes.affectedMenuCount)
      }
      setEditOpen(false)
      await load()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDelete = async (s: SauceRow) => {
    if (!s.id) return
    if (!await appConfirm(t("posCostSauceConfirmDelete") || `"${s.name}" 배합을 삭제할까요?`)) return
    try {
      await deleteSauce({ id: s.id })
      await load()
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const excludeCodes = React.useMemo(() => new Set(formFoodItems.map((i) => i.ingredientCode)), [formFoodItems])

  const sortedItemsForLink = React.useMemo(() => {
    return [...items].sort((a, b) => String(a.code).localeCompare(String(b.code)))
  }, [items])

  const linkedItemOrphan = React.useMemo(() => {
    const c = formLinkedItemCode.trim()
    if (!c || sortedItemsForLink.some((i) => i.code === c)) return null
    return c
  }, [formLinkedItemCode, sortedItemsForLink])

  React.useEffect(() => {
    if (!editOpen) {
      setLinkedItemFilterSearch("")
      setLinkedItemFilterCategory("all")
      void syncCostAnalysisRuntime("calculator")
    }
  }, [editOpen])

  const linkedItemCategoryOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const c = String(it.category ?? "").trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [items])

  const filteredLinkedItemsForPicker = React.useMemo(() => {
    const q = linkedItemFilterSearch.trim().toLowerCase()
    const cat = linkedItemFilterCategory
    return sortedItemsForLink.filter((it) => {
      if (cat !== "all" && String(it.category ?? "").trim() !== cat) return false
      if (!q) return true
      return (
        String(it.code ?? "").toLowerCase().includes(q) ||
        String(it.name ?? "").toLowerCase().includes(q) ||
        String(it.category ?? "").toLowerCase().includes(q)
      )
    })
  }, [sortedItemsForLink, linkedItemFilterSearch, linkedItemFilterCategory])

  const linkedItemSelectedRow = React.useMemo(() => {
    const c = formLinkedItemCode.trim()
    if (!c) return null
    return sortedItemsForLink.find((i) => i.code === c) ?? null
  }, [formLinkedItemCode, sortedItemsForLink])

  const linkedOrphanVisibleInList = React.useMemo(() => {
    if (linkedItemOrphan == null || linkedItemFilterCategory !== "all") return false
    const q = linkedItemFilterSearch.trim().toLowerCase()
    if (!q) return true
    return linkedItemOrphan.toLowerCase().includes(q)
  }, [linkedItemOrphan, linkedItemFilterCategory, linkedItemFilterSearch])

  const openItemsPrefillFromSauce = React.useCallback(
    (s: SauceRow) => {
      if (s.usageKind === "store_use") return
      const u = new URLSearchParams()
      u.set("prefillFromSauce", "1")
      u.set("name", s.name)
      u.set("unit", (s.unit || "g").trim() || "g")
      const tq = s.totalQuantity > 0 ? String(s.totalQuantity) : "1000"
      u.set("totalQty", tq)
      u.set("batchCost", String(Math.round(s.totalWithOverhead * 100) / 100))
      u.set("sauceCode", s.code)
      router.push(`/admin/items?${u.toString()}`)
    },
    [router]
  )

  const handleFoodItemsChange = React.useCallback((items: RecipeItem[]) => {
    setFormFoodItems(items)
    const sum = Math.round(items.reduce((s, i) => s + i.quantity, 0) * 100) / 100
    setFormTotalQuantity(sum)
  }, [])

  const handleRecalcAll = React.useCallback(async () => {
    setRecalcLoading(true)
    try {
      const res = await recalculateSauces()
      setRecalcAffected(res.affectedMenuCount ?? null)
      await load()
      await appAlert(
        `${t("posCostSauceRecalcAll")}: ${res.count ?? 0}. ${t("posCostSauceRecalcAffected")}: ${res.affectedMenuCount ?? 0}`
      )
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setRecalcLoading(false)
    }
  }, [load, t])

  return (
    <div className="space-y-4">
      {!canEdit ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">{t("posCostViewOnlyHint")}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("posCostSauceSearchPh") || "코드·이름 검색"}
              className="h-9 pl-9 pr-9 text-sm border-border"
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
            {searchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <Button
            size="sm"
            className="h-9 px-4 gap-1.5 text-xs font-semibold shrink-0"
            onClick={load}
            disabled={loading}
          >
            <Search className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
            {loading ? (t("loading") || "불러오는 중...") : (t("posCostBtnQuery") || "검색")}
          </Button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap hidden sm:inline">
            {t("posCostSauceUsageKind") || "구분"}
          </span>
          <Select value={listUsageFilter} onValueChange={(v) => setListUsageFilter(v as "all" | "for_sale" | "store_use")}>
            <SelectTrigger className="h-9 w-[min(100vw-2rem,10.5rem)] sm:w-40 text-xs bg-background" aria-label={t("posCostSauceUsageKind") || "구분"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[110]" position="popper">
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="for_sale">{t("posCostSauceUsageBtnForSale") || t("posCostSauceUsageForSale")}</SelectItem>
              <SelectItem value="store_use">{t("posCostSauceUsageBtnStore") || t("posCostSauceUsageStore")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canEdit ? (
          <>
            <Button size="sm" className="h-9" onClick={() => void handleNew()} disabled={addOpenLoading || loading}>
              <Plus className={cn("h-3.5 w-3.5 mr-1.5", addOpenLoading && "animate-pulse")} />
              {addOpenLoading ? (t("loading") || "불러오는 중...") : (t("posCostSauceNew") || "배합 추가")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => void handleRecalcAll()}
              disabled={recalcLoading || loading}
            >
              {recalcLoading ? t("loading") : t("posCostSauceRecalcAll")}
            </Button>
          </>
        ) : null}
      </div>
      {recalcAffected != null && recalcAffected > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("posCostSauceRecalcAffected")}: {recalcAffected} — {t("posCostClickSearchToLoad")}
        </p>
      ) : null}

      {loading ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-8 text-center">
          <p className="text-sm text-destructive font-medium mb-2">{t("loadError") || "데이터를 불러오지 못했습니다."}</p>
          <p className="text-xs text-muted-foreground mb-3">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load}>{t("retry") || "다시 시도"}</Button>
        </div>
      ) : !listQueried ? (
        <div className="rounded-lg border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("posCostSauceClickSearchToLoad") || "[검색] 버튼을 눌러 배합 원가 목록을 불러오세요."}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-20 text-center">{t("posMenuCode")}</TableHead>
                <TableHead className="w-[100px] text-center">{t("posCostSauceUsageKind") || "구분"}</TableHead>
                <TableHead className="w-[7.5rem] min-w-[6.5rem] text-center text-xs font-medium">
                  {t("posCostSauceTableLinkCol") || "연결"}
                </TableHead>
                <TableHead className="text-center">{t("posCostName")}</TableHead>
                <TableHead className="text-center">{t("posCostSauceTotalCapacity") || "총용량"} (g)</TableHead>
                <TableHead className="text-center">{t("posCostSauceCostPerUnit") || "단가"}</TableHead>
                <TableHead className="text-center">{t("posCostSauceTotalCost") || "총원가"}</TableHead>
                <TableHead className="text-center">{t("posCostSauceOh") || "OH%"}</TableHead>
                {canEdit ? <TableHead className="w-24 text-center" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displaySauces.map((s) => (
                <TableRow key={s.id ?? s.code} className="border-b">
                  <TableCell className="font-mono text-xs text-center">{s.code}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        s.usageKind === "store_use"
                          ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {s.usageKind === "store_use"
                        ? (t("posCostSauceUsageStore") || "매장")
                        : (t("posCostSauceUsageForSale") || "판매")}
                    </span>
                  </TableCell>
                  <TableCell className="text-center align-middle px-1">
                    {s.usageKind === "for_sale" && s.linkedItemCode ? (
                      <span className="font-mono text-[11px] sm:text-xs tabular-nums text-foreground break-all leading-tight block max-w-[8rem] mx-auto">
                        {s.linkedItemCode}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {s.usageKind === "for_sale" ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-left hover:underline text-primary font-medium"
                        onClick={() => openItemsPrefillFromSauce(s)}
                        title={t("posCostSauceGoToItems") || "품목 등록으로 이동 (이름·원가 자동 입력)"}
                      >
                        {s.name}
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                      </button>
                    ) : (
                      <span>{s.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{s.totalQuantity ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.costPerUnit.toFixed(4)} ฿/{s.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.totalWithOverhead.toFixed(1)} ฿</TableCell>
                  <TableCell className="text-right tabular-nums">{s.overheadPercent}%</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEdit(s)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(s)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sauces.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground max-w-xl mx-auto space-y-2">
              <p>
                {t("posCostSauceEmpty") ||
                  "아직 배합이 없습니다. 「배합 추가」로 레시피를 만들면 이 목록과 원가 계산기에서 바로 선택할 수 있습니다."}
              </p>
              <p className="text-xs text-muted-foreground/90 leading-relaxed">
                {t("posCostSauceRlsDataHint")}
              </p>
            </div>
          )}
          {sauces.length > 0 && displaySauces.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("posCostNoData") || "검색 조건에 맞는 데이터가 없습니다."}
            </div>
          )}
        </div>
      )}

      {/** Radix: 중첩 Dialog(배합 재료 추가 등)가 열리려면 바깥 Dialog는 modal={false} 필요 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen} modal={false}>
        {/** 상단 고정: 판매/매장 전환 시 높이 변해도 화면 중앙 기준으로 위치가 흔들리지 않음 */}
        <DialogContent className="max-w-4xl max-h-[min(90vh,calc(100vh-2.5rem))] overflow-y-auto top-[5vh] max-sm:top-4 translate-y-0">
          <DialogHeader>
            <DialogTitle>{editing ? (t("posCostSauceEdit") || "배합 수정") : (t("posCostSauceNew") || "배합 추가")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-2.5">
                <div className="flex flex-col gap-1.5 shrink-0 w-full md:w-auto md:min-w-[200px]">
                  <span className="text-sm font-semibold text-muted-foreground">
                    {t("posCostSauceUsageKind")}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant={formUsageKind === "for_sale" ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-9 flex-1 gap-1.5 px-2 text-sm font-semibold border",
                        formUsageKind === "for_sale"
                          ? "shadow-sm"
                          : "text-muted-foreground"
                      )}
                      onClick={() => {
                        setFormUsageKind("for_sale")
                        setFormLinkedItemCode((prev) => {
                          if (prev.trim()) return prev
                          return suggestLinkedItemCodeForForSaleBlend(items, formName, formCode) ?? ""
                        })
                        window.setTimeout(() => {
                          linkedItemSectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
                          linkedItemSearchInputRef.current?.focus()
                        }, 50)
                      }}
                    >
                      <ShoppingBag className="size-4 shrink-0 opacity-90" aria-hidden />
                      <span className="truncate">{t("posCostSauceUsageBtnForSale")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 flex-1 gap-1.5 px-2 text-sm font-semibold border",
                        formUsageKind === "store_use"
                          ? "bg-amber-600 hover:bg-amber-600/90 text-white border-amber-600 shadow-sm"
                          : "text-muted-foreground"
                      )}
                      onClick={() => {
                        setFormUsageKind("store_use")
                        setFormLinkedItemCode("")
                      }}
                    >
                      <Warehouse className="size-4 shrink-0 opacity-90" aria-hidden />
                      <span className="truncate">{t("posCostSauceUsageBtnStore")}</span>
                    </Button>
                  </div>
                </div>

                <div className="flex flex-1 flex-wrap items-end gap-x-2 gap-y-2 min-w-0 border-t border-dashed border-border/60 pt-2.5 md:border-t-0 md:pt-0 md:border-l md:border-solid md:pl-2.5">
                  <div className="space-y-0.5 w-[5rem] shrink-0">
                    <label className="block text-xs font-medium text-muted-foreground leading-none">{t("posMenuCode")}</label>
                    <Input
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      className="h-9 px-2 text-sm font-mono bg-secondary/50"
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="space-y-0.5 min-w-[8rem] flex-1 basis-[min(100%,12rem)]">
                    <label className="block text-xs font-medium text-muted-foreground leading-none">{t("posCostName")}</label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="h-9 text-base bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-0.5 w-[4.5rem] shrink-0">
                    <label className="block text-xs font-medium text-muted-foreground leading-none">{t("posCostUnit") || "단위"}</label>
                    <Select value={formUnit} onValueChange={setFormUnit}>
                      <SelectTrigger className="h-9 px-2 text-sm bg-secondary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[110]" position="popper">
                        {unitSelectValues.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-0.5 w-[4rem] shrink-0">
                    <label className="block text-xs font-medium text-muted-foreground leading-none">{t("posCostSauceOh") || "OH%"}</label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={formOhStr}
                      onChange={(e) => setFormOhStr(e.target.value)}
                      onBlur={() => {
                        const n = parseFloat(formOhStr)
                        if (!isNaN(n) && n >= 0 && n <= 50) setFormOh(n)
                        else setFormOhStr(String(formOh))
                      }}
                      className="h-9 px-2 text-sm tabular-nums bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-0.5 w-[5.75rem] shrink-0">
                    <label className="block text-xs font-medium text-muted-foreground leading-none whitespace-nowrap">
                      {t("posCostSauceTotalCapacity") || "총용량"}
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={formTotalQuantity}
                      onChange={(e) => setFormTotalQuantity(parseFloat(e.target.value) || 0)}
                      className="h-9 px-2 text-sm font-mono tabular-nums bg-secondary/50"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-snug border-t border-border/50 pt-2">
                {formUsageKind === "store_use"
                  ? (t("posCostSauceUsageStoreHint") || "")
                  : (t("posCostSauceUsageForSaleHint") || "")}
              </p>

              {formUsageKind === "for_sale" && (
                <div
                  ref={linkedItemSectionRef}
                  className={cn(
                    "space-y-2 pt-2 border-t border-border/50 rounded-md border border-border/40 bg-muted/15 p-2.5",
                    !formLinkedItemCode.trim() && "ring-2 ring-amber-500/40 border-amber-600/50"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      {t("posCostSauceLinkedItem") || "연결 품목 (품목관리 코드)"}
                      <span className="text-amber-700 dark:text-amber-400 font-normal">
                        {" "}
                        ({lang === "ko" ? "필수" : "required"})
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground shrink-0"
                      onClick={() => setFormLinkedItemCode("")}
                      disabled={!formLinkedItemCode.trim()}
                    >
                      {t("posCostSauceLinkedClear")}
                    </Button>
                  </div>
                  {linkedItemSelectedRow ? (
                    <div className="rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs">
                      <span className="font-mono text-muted-foreground">{linkedItemSelectedRow.code}</span>
                      <span className="mx-1.5 text-muted-foreground">—</span>
                      <span className="font-medium">{linkedItemSelectedRow.name}</span>
                      {linkedItemSelectedRow.category ? (
                        <span className="ml-2 text-[10px] text-muted-foreground">({linkedItemSelectedRow.category})</span>
                      ) : null}
                    </div>
                  ) : linkedItemOrphan != null ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs">
                      <span className="font-mono">{linkedItemOrphan}</span>
                      <span className="ml-2 text-amber-700 dark:text-amber-400">
                        ({t("posCostSauceLinkedMissing") || "목록에 없음"})
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">{t("posCostSauceLinkedItemPh") || "품목 선택"}</p>
                  )}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={linkedItemSearchInputRef}
                      value={linkedItemFilterSearch}
                      onChange={(e) => setLinkedItemFilterSearch(e.target.value)}
                      placeholder={t("posCostSearchIngredientPh") || "이름 또는 코드 검색..."}
                      className="h-9 pl-8 text-sm bg-background/90"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {t("itemsCategory")}
                    </label>
                    <Select value={linkedItemFilterCategory} onValueChange={setLinkedItemFilterCategory}>
                      <SelectTrigger className="h-9 text-sm bg-background/90 z-0">
                        <SelectValue placeholder={t("itemsCategoryAll")} />
                      </SelectTrigger>
                      <SelectContent className="z-[110]" position="popper">
                        <SelectItem value="all">{t("posMenuCategoryAll") || t("itemsCategoryAll") || "전체"}</SelectItem>
                        {linkedItemCategoryOptions.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ScrollArea className="h-[min(40vh,240px)] rounded-md border border-border/60 bg-background/90">
                    <div className="p-1 space-y-0.5">
                      {linkedOrphanVisibleInList && (
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                            formLinkedItemCode === linkedItemOrphan && "bg-primary/15 ring-1 ring-primary/30"
                          )}
                          onClick={() => {
                            if (linkedItemOrphan) setFormLinkedItemCode(linkedItemOrphan)
                          }}
                        >
                          <span className="font-mono text-xs">{linkedItemOrphan}</span>
                          <span className="ml-2 text-[11px] text-amber-700 dark:text-amber-400">
                            ({t("posCostSauceLinkedMissing") || "목록에 없음"})
                          </span>
                        </button>
                      )}
                      {filteredLinkedItemsForPicker.map((it) => (
                        <button
                          key={it.code}
                          type="button"
                          className={cn(
                            "w-full rounded-sm px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                            formLinkedItemCode === it.code && "bg-primary/15 ring-1 ring-primary/30"
                          )}
                          onClick={() => setFormLinkedItemCode(it.code)}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                            <span className="font-mono text-xs text-muted-foreground">{it.code}</span>
                            <span className="text-muted-foreground">—</span>
                            <span className="font-medium">{it.name}</span>
                          </div>
                          {it.category ? (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">{it.category}</div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                  {filteredLinkedItemsForPicker.length === 0 && !linkedOrphanVisibleInList && (
                    <p className="text-center text-xs text-muted-foreground py-3">{t("posCostNoIngredientsFound")}</p>
                  )}
                </div>
              )}
            </div>
            <IngredientTable
              title={t("posCostSauceIngredients") || "재료"}
              type="food"
              items={formFoodItems}
              onItemsChange={handleFoodItemsChange}
              addDialogIncludeSauces
              addDialogRequireStandardUnits={false}
              excludeCodes={excludeCodes}
              costTextDark
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saveLoading}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saveLoading}>{saveLoading ? (t("loading") || "저장 중...") : (t("save") || "저장")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
