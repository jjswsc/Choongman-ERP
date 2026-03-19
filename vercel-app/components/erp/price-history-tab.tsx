"use client"

import * as React from "react"
import { History, Search, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getPriceHistory, getPosMenus, getPosMenuCategoriesConfig, getItemCategories, type PriceHistoryRow, backfillPriceHistory, restoreFromPriceHistory } from "@/lib/api-client"
import { POS_MAIN_CATEGORIES, getPresetCategoriesForMain } from "@/lib/pos-menu-categories"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

const FIELD_LABELS: Record<string, string> = {
  price: "price",
  price_delivery: "price_delivery",
  price_modifier: "price_modifier",
  price_modifier_delivery: "price_modifier_delivery",
  price_modifier_packaging: "price_modifier_packaging",
  cost: "cost",
}

export interface PriceHistoryTabProps {
  /** 조회할 엔티티 타입들 (메뉴 페이지: pos_menu, pos_menu_option / 품목 페이지: item) */
  entityTypes: ("pos_menu" | "pos_menu_option" | "item")[]
  /** 메뉴 모드(카테고리+메뉴 선택) 또는 품목 모드(카테고리 선택) */
  mode: "menu" | "item"
  /** 탭 제목 (선택) */
  title?: string
}

export function PriceHistoryTab({ entityTypes, mode, title }: PriceHistoryTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<PriceHistoryRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [mainCategoryFilter, setMainCategoryFilter] = React.useState("all")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [menuFilter, setMenuFilter] = React.useState("all")
  const [fromDate, setFromDate] = React.useState("")
  const [toDate, setToDate] = React.useState("")
  const [categories, setCategories] = React.useState<string[]>([])
  const [categoriesByMain, setCategoriesByMain] = React.useState<Record<string, string[]>>({})
  const [menus, setMenus] = React.useState<{ id: string; name: string; code: string; categoryMain?: string; category?: string }[]>([])
  const [backfilling, setBackfilling] = React.useState(false)
  const [restoreDate, setRestoreDate] = React.useState("")
  const [restoring, setRestoring] = React.useState(false)
  /** 품목 모드: 원가 vs 홀/판매가 선택 */
  const [itemFieldFilter, setItemFieldFilter] = React.useState<"cost" | "price">("price")
  /** 메뉴 모드: 가격 항목 선택 */
  const [menuFieldFilter, setMenuFieldFilter] = React.useState<string>("price")

  React.useEffect(() => {
    if (mode === "menu") {
      Promise.all([getPosMenuCategoriesConfig(), getPosMenus()])
        .then(([config, menuList]) => {
          const mainCats = config?.mainCategories || [...POS_MAIN_CATEGORIES]
          const byMain = config?.categoriesByMain || {}
          setCategories(mainCats)
          setCategoriesByMain(byMain)
          setMenus((menuList || []).map((m) => ({
            id: String(m.id),
            name: m.name,
            code: m.code || "",
            categoryMain: m.categoryMain,
            category: m.category,
          })))
        })
        .catch(() => { setCategories([]); setCategoriesByMain({}); setMenus([]) })
    } else {
      getItemCategories()
        .then((r) => setCategories((r?.categories || []).filter(Boolean).sort()))
        .catch(() => setCategories([]))
    }
  }, [mode])

  const loadHistory = React.useCallback(async () => {
    setLoading(true)
    try {
      const allRows: PriceHistoryRow[] = []
      const catMain = mode === "menu" && mainCategoryFilter !== "all" ? mainCategoryFilter : undefined
      const cat = categoryFilter !== "all" ? categoryFilter : undefined
      const menuId = mode === "menu" && menuFilter !== "all" ? menuFilter : undefined
      for (const et of entityTypes) {
        const params: Parameters<typeof getPriceHistory>[0] = {
          entityType: et,
          from: fromDate || undefined,
          to: toDate || undefined,
          search: searchTerm.trim() || undefined,
          categoryMain: catMain,
          category: cat,
          menuId,
          limit: 200,
        }
        const data = await getPriceHistory(params)
        allRows.push(...(Array.isArray(data) ? data : []))
      }
      allRows.sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
      setRows(allRows.slice(0, 300))
    } catch (e) {
      console.error("getPriceHistory:", e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [entityTypes, mode, fromDate, toDate, searchTerm, mainCategoryFilter, categoryFilter, menuFilter])

  const handleBackfill = React.useCallback(async () => {
    if (!confirm(t("priceHistoryBackfillConfirm") || "기존 메뉴·품목의 현재 가격을 이력에 등록합니다. 계속할까요?")) return
    setBackfilling(true)
    try {
      const res = await backfillPriceHistory()
      if (res.success) {
        alert(res.message || `${res.inserted}건 등록됨`)
        loadHistory()
      } else {
        alert(res.error || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "실패")
    } finally {
      setBackfilling(false)
    }
  }, [loadHistory, t])

  const handleRestoreByDate = React.useCallback(async () => {
    const date = restoreDate.trim()
    if (!date) {
      alert(t("priceHistoryRestoreDateRequired") || "복구할 날짜(YYYY-MM-DD)를 선택하세요.")
      return
    }
    if (!confirm(t("priceHistoryRestoreByDateConfirm") || `가격 이력의 ${date} 시점 가격으로 메뉴·옵션 가격을 덮어씁니다. 계속할까요?`)) return
    setRestoring(true)
    try {
      const res = await restoreFromPriceHistory({ targetDate: date, dryRun: false })
      if (res.success) {
        alert(res.message || "복구 완료")
        setRestoreDate("")
        loadHistory()
      } else {
        alert(res.error || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "실패")
    } finally {
      setRestoring(false)
    }
  }, [restoreDate, loadHistory, t])

  const formatDate = (s: string) => {
    try {
      const d = new Date(s)
      return d.toLocaleString(lang === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return s
    }
  }

  const formatField = (fn: string) => {
    const pascal = fn.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join('')
    const key = `priceHistoryField${pascal}`
    return t(key) || FIELD_LABELS[fn] || fn
  }

  const formatValue = (v: number | null) =>
    v != null ? Number(v).toLocaleString(lang === "ko" ? "ko-KR" : "en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : "—"

  const formatDateOnly = React.useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    } catch {
      return dateStr
    }
  }, [lang])

  const subCategories = React.useMemo(() => {
    if (mode !== "menu") return []
    if (mainCategoryFilter === "all") {
      const all = Object.values(categoriesByMain).flat()
      const preset = POS_MAIN_CATEGORIES.flatMap((m) => getPresetCategoriesForMain(m) || [])
      return [...new Set([...all, ...preset])].filter(Boolean).sort()
    }
    const preset = getPresetCategoriesForMain(mainCategoryFilter)
    const fromConfig = categoriesByMain[mainCategoryFilter] || []
    return [...new Set([...(preset || []), ...fromConfig])].filter(Boolean).sort()
  }, [mode, mainCategoryFilter, categoriesByMain])

  const filteredMenus = React.useMemo(() => {
    if (mode !== "menu") return []
    return menus.filter((m) => {
      if (mainCategoryFilter !== "all" && (m.categoryMain || "").trim() !== mainCategoryFilter) return false
      if (categoryFilter !== "all" && (m.category || "").trim() !== categoryFilter) return false
      return true
    })
  }, [mode, menus, mainCategoryFilter, categoryFilter])

  /** 품목 모드: 품목별 타임라인 (품목명 > 초기 > 변경날짜1 > 변경날짜2 > ... > 현재) */
  const itemTimelines = React.useMemo(() => {
    if (mode !== "item" || rows.length === 0) return []
    const filtered = rows.filter((r) => r.field_name === itemFieldFilter)
    const byEntity = new Map<string, PriceHistoryRow[]>()
    for (const r of filtered) {
      const key = r.entity_id
      if (!byEntity.has(key)) byEntity.set(key, [])
      byEntity.get(key)!.push(r)
    }
    return Array.from(byEntity.entries())
      .map(([entityId, list]) => {
        const sorted = [...list].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())
        const name = sorted[0]?.entity_display_name || entityId
        const nodes: { label: string; price: number | null; date?: string }[] = []
        for (const row of sorted) {
          if (row.old_value == null) {
            nodes.push({ label: t("priceHistoryInitial") || "초기", price: row.new_value, date: row.changed_at })
          } else {
            nodes.push({
              label: formatDateOnly(row.changed_at),
              price: row.new_value,
              date: row.changed_at,
            })
          }
        }
        const lastPrice = sorted.length > 0 ? sorted[sorted.length - 1].new_value : null
        if (nodes.length > 0) {
          nodes.push({ label: t("priceHistoryCurrent") || "현재", price: lastPrice })
        }
        return { entityId, name, nodes }
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  }, [mode, rows, itemFieldFilter, t, formatDateOnly])

  /** 메뉴 모드: 메뉴/옵션별 타임라인 (품목과 동일 양식) */
  const menuTimelines = React.useMemo(() => {
    if (mode !== "menu" || rows.length === 0) return []
    const filtered = rows.filter((r) => r.field_name === menuFieldFilter)
    const byEntity = new Map<string, PriceHistoryRow[]>()
    for (const r of filtered) {
      const key = r.entity_id
      if (!byEntity.has(key)) byEntity.set(key, [])
      byEntity.get(key)!.push(r)
    }
    return Array.from(byEntity.entries())
      .map(([entityId, list]) => {
        const sorted = [...list].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())
        const name = sorted[0]?.entity_display_name || entityId
        const nodes: { label: string; price: number | null; date?: string }[] = []
        for (const row of sorted) {
          if (row.old_value == null) {
            nodes.push({ label: t("priceHistoryInitial") || "초기", price: row.new_value, date: row.changed_at })
          } else {
            nodes.push({
              label: formatDateOnly(row.changed_at),
              price: row.new_value,
              date: row.changed_at,
            })
          }
        }
        const lastPrice = sorted.length > 0 ? sorted[sorted.length - 1].new_value : null
        if (nodes.length > 0) {
          nodes.push({ label: t("priceHistoryCurrent") || "현재", price: lastPrice })
        }
        return { entityId, name, nodes }
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
  }, [mode, rows, menuFieldFilter, t, formatDateOnly])

  /** 타임라인용 (품목/메뉴 공통): max 노드 수, 테이블용 정렬 */
  const timelines = mode === "item" ? itemTimelines : menuTimelines
  const maxNodes = React.useMemo(() => {
    if (timelines.length === 0) return 0
    return Math.max(...timelines.map((t) => t.nodes.length))
  }, [timelines])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {mode === "menu" && (
          <>
            <Select
              value={mainCategoryFilter}
              onValueChange={(v) => {
                setMainCategoryFilter(v)
                setCategoryFilter("all")
              }}
            >
              <SelectTrigger className="h-9 w-[120px] text-xs">
                <SelectValue placeholder={t("posMenuCategoryMain") || "대분류"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue placeholder={t("posMenuCategory") || "카테고리"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
                {subCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={menuFieldFilter} onValueChange={setMenuFieldFilter}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue placeholder={t("priceHistoryFieldPrice") || "홀/판매가"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price">{t("priceHistoryFieldPrice") || "홀/판매가"}</SelectItem>
                <SelectItem value="price_delivery">{t("priceHistoryFieldPriceDelivery") || "배달앱"}</SelectItem>
                <SelectItem value="price_modifier">{t("priceHistoryFieldPriceModifier") || "옵션 추가금(홀)"}</SelectItem>
                <SelectItem value="price_modifier_delivery">{t("priceHistoryFieldPriceModifierDelivery") || "옵션 추가금(배달)"}</SelectItem>
                <SelectItem value="price_modifier_packaging">{t("priceHistoryFieldPriceModifierPackaging") || "옵션 추가금(포장)"}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        {mode === "item" && (
          <>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue placeholder={t("posMenuCategory") || "카테고리"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={itemFieldFilter} onValueChange={(v: "cost" | "price") => setItemFieldFilter(v)}>
              <SelectTrigger className="h-9 w-[120px] text-xs">
                <SelectValue placeholder={t("priceHistoryFieldCost") || "원가"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cost">{t("priceHistoryFieldCost") || "원가"}</SelectItem>
                <SelectItem value="price">{t("priceHistoryFieldPrice") || "홀/판매가"}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        {mode === "menu" && (
          <Select value={menuFilter} onValueChange={setMenuFilter}>
            <SelectTrigger className="h-9 w-[180px] text-xs">
              <SelectValue placeholder={t("priceHistoryMenuSelect") || "메뉴 선택"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll") || "전체"}</SelectItem>
              {filteredMenus.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.code} {m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("priceHistorySearchPh") || "메뉴/품목명 검색"}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 w-[140px] text-sm"
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 w-[140px] text-sm"
          />
        </div>
        <Button size="sm" className="h-9 gap-1.5" onClick={loadHistory} disabled={loading}>
          <Search className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
          {loading ? (t("loading") || "조회 중") : (t("priceHistoryBtnSearch") || "검색")}
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleBackfill} disabled={backfilling}>
          {backfilling ? (t("loading") || "처리 중") : (t("priceHistoryBackfillBtn") || "일괄 초기 등록")}
        </Button>
        {mode === "menu" && (
          <>
            <Input
              type="date"
              value={restoreDate}
              onChange={(e) => setRestoreDate(e.target.value)}
              className="h-9 w-[140px] text-sm"
              title={t("priceHistoryRestoreDatePh") || "복구할 날짜"}
            />
            <Button size="sm" variant="secondary" className="h-9 gap-1.5" onClick={handleRestoreByDate} disabled={restoring || !restoreDate.trim()}>
              {restoring ? (t("loading") || "처리 중") : (t("priceHistoryRestoreByDateBtn") || "해당 날짜 가격으로 복구")}
            </Button>
          </>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {/* 품목/메뉴 공통: 이름 > 초기 > 변경날짜1 > ... > 현재 (테이블로 칸 정렬) */}
        {timelines.length > 0 && maxNodes > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold text-xs w-[200px] min-w-[180px]">
                    {mode === "item" ? (t("priceHistoryColName") || "품목명") : (t("priceHistoryColName") || "메뉴/품목")}
                  </th>
                  {Array.from({ length: maxNodes }, (_, i) => (
                    <th key={i} className="px-2 py-3 text-center font-semibold text-xs w-[100px] min-w-[90px]">
                      {" "}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timelines.map(({ entityId, name, nodes }) => (
                  <tr key={entityId} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium align-top w-[200px] min-w-[180px]">
                      <span className="line-clamp-2" title={name}>{name}</span>
                    </td>
                    {Array.from({ length: maxNodes }, (_, i) => {
                      const node = nodes[i]
                      return (
                        <td key={i} className="px-2 py-2 text-center align-top w-[100px] min-w-[90px]">
                          {node ? (
                            <>
                              <div className="text-xs text-muted-foreground mb-0.5">{node.label}</div>
                              <div className="tabular-nums font-medium text-primary">{formatValue(node.price)}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {timelines.length === 0 && !loading && (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground space-y-2">
            <History className="mx-auto h-10 w-10 mb-2 opacity-50" />
            <p>{t("priceHistoryEmpty") || "검색"}</p>
            <p className="text-xs opacity-80">{t("priceHistoryEmptyHint") || "메뉴/품목 가격을 수정하면 이력이 기록됩니다. Supabase에 price_history 테이블이 있는지 확인하세요."}</p>
          </div>
        )}
        {rows.length === 0 && loading && (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">{t("loading")}</div>
        )}
      </div>
    </div>
  )
}
