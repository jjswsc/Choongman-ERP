"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Download,
  Upload,
  RefreshCw,
  UtensilsCrossed,
  PauseCircle,
  PlayCircle,
  Pencil,
  ChevronDown,
  ChevronRight,
  Ban,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { Input } from "@/components/ui/input"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { AdminEmptyState } from "@/components/erp/admin-empty-state"
import { isPosMenuSoldOut } from "@/lib/pos-menu-sold-out"
import { isChickenMenu, isChickenDefaultOption, resolveOptionCode } from "@/app/admin/pos-menus/pos-menus-page-helpers"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"

export interface PosMenuListTableProps {
  t: (k: string) => string
  menuImportInputRef: React.RefObject<HTMLInputElement | null>
  handlePosMenuImportFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  handleDownloadFilteredMenusExcel: () => Promise<void>
  handleDownloadAllMenusDetailedExcel: () => Promise<void>
  menuImportBusy: boolean
  handleDownloadPosMenuTemplate: () => Promise<void>
  menuImportProgress: { done: number; total: number } | null
  refreshLoading: boolean
  loadMenusAndCategories: (setLoadingState?: (v: boolean) => void) => Promise<void>
  setRefreshLoading: React.Dispatch<React.SetStateAction<boolean>>
  mainCategoryFilter: string
  setMainCategoryFilter: React.Dispatch<React.SetStateAction<string>>
  setCategoryFilter: React.Dispatch<React.SetStateAction<string>>
  mainCategories: string[]
  categoryFilter: string
  optionsConfigCategoriesByMain: string[]
  soldOutFilter: "all" | "selling" | "soldOut"
  setSoldOutFilter: React.Dispatch<React.SetStateAction<"all" | "selling" | "soldOut">>
  searchTerm: string
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>
  filteredMenus: PosMenu[]
  editingId: string | null
  expandedMenuId: string | null
  expandedMenuData: { options: PosMenuOption[] } | null
  optionPartLabel: (name: string) => string
  handleSoldOutToggleOption: (opt: PosMenuOption, menuId: string) => Promise<void>
  soldOutTogglingOptionId: string | null
  handleEditOptionInList: (menuId: string) => void
  handleExpandMenu: (menuId: string) => Promise<void>
  handleSoldOutToggle: (menu: PosMenu) => Promise<void>
  soldOutTogglingId: string | null
  handleEdit: (menu: PosMenu) => void
  handleMarkUnused: (menu: PosMenu) => Promise<void>
}

export function PosMenuListTable({
  t,
  menuImportInputRef,
  handlePosMenuImportFileChange,
  handleDownloadFilteredMenusExcel,
  handleDownloadAllMenusDetailedExcel,
  menuImportBusy,
  handleDownloadPosMenuTemplate,
  menuImportProgress,
  refreshLoading,
  loadMenusAndCategories,
  setRefreshLoading,
  mainCategoryFilter,
  setMainCategoryFilter,
  setCategoryFilter,
  mainCategories,
  categoryFilter,
  optionsConfigCategoriesByMain,
  soldOutFilter,
  setSoldOutFilter,
  searchTerm,
  setSearchTerm,
  filteredMenus,
  editingId,
  expandedMenuId,
  expandedMenuData,
  optionPartLabel,
  handleSoldOutToggleOption,
  soldOutTogglingOptionId,
  handleEditOptionInList,
  handleExpandMenu,
  handleSoldOutToggle,
  soldOutTogglingId,
  handleEdit,
  handleMarkUnused,
}: PosMenuListTableProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <h3 className="text-sm font-bold">{t("posMenuList") || "메뉴 목록"}</h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={menuImportInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={handlePosMenuImportFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleDownloadFilteredMenusExcel()}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {t("outExcelDownload") || "엑셀 다운로드"} ({t("btn_query") || "조회"})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleDownloadAllMenusDetailedExcel()}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {t("outExcelDownload") || "엑셀 다운로드"} ({t("all") || "전체"})
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={menuImportBusy}
            onClick={handleDownloadPosMenuTemplate}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {t("posMenuImportTemplate")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={menuImportBusy}
            onClick={() => menuImportInputRef.current?.click()}
          >
            <Upload className={cn("h-3.5 w-3.5 mr-1.5", menuImportBusy && "animate-pulse")} />
            {menuImportBusy
              ? menuImportProgress
                ? `${t("loading") || "Loading"} ${menuImportProgress.done}/${menuImportProgress.total}`
                : (t("loading") || "처리 중…")
              : t("posMenuImportUpload")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={refreshLoading}
            onClick={() => loadMenusAndCategories(setRefreshLoading)}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", refreshLoading && "animate-spin")} />
            {t("btn_query") || t("stockBtnSearch") || "조회"}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-3">
        <Select
          value={mainCategoryFilter}
          onValueChange={(v) => {
            setMainCategoryFilter(v)
            setCategoryFilter("all")
          }}
        >
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
            <SelectValue placeholder={t("posMenuCategorySub") || "소분류"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
            {optionsConfigCategoriesByMain.map((c) => (
              <SelectItem key={c} value={c}>{translatePosMenuCategoryLabel(c, t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={soldOutFilter} onValueChange={(v) => setSoldOutFilter(v as "all" | "selling" | "soldOut")}>
          <SelectTrigger className="h-9 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
            <SelectItem value="selling">{t("posAvailable") || "판매"}</SelectItem>
            <SelectItem value="soldOut">{t("posSoldOut") || "품절"}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("itemsSearchPh")}
          className="h-9 flex-1 text-xs"
        />
      </div>
      <AdminTableScroll className="max-h-[calc(100dvh-14rem)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
            <tr className="border-b bg-muted/30">
              <th className="px-2 py-3 text-[11px] font-bold text-center w-8"></th>
              <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[88px]">{t("itemsColCode")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[140px]">{t("posMenuName")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posMenuCategoryMain")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuCategory")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuPriceCol") || "가격"}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[112px]">{t("itemsColAction")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredMenus.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <AdminEmptyState
                    icon={UtensilsCrossed}
                    title={t("itemsNoResults")}
                    className="border-0 bg-transparent"
                  />
                </td>
              </tr>
            ) : (
              filteredMenus.map((m, idx) => {
                const isEditingRow = editingId === m.id
                const isSoldOutToday = isPosMenuSoldOut(m.soldOutDate)
                const isExpanded = expandedMenuId === m.id
                const expanded = isExpanded ? expandedMenuData : null
                const expandedRows = (() => {
                  if (!isExpanded || !expanded) return null
                  const sorted = [...expanded.options].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
                  const toShow = isChickenMenu(m.code) ? sorted.filter((opt) => !isChickenDefaultOption(opt.name)) : sorted
                  if (toShow.length === 0) {
                    if (isChickenMenu(m.code) && sorted.length > 0) {
                      return (
                        <tr key={`${m.id}-base`} className="bg-amber-500/5 border-b">
                          <td className="px-2 py-2 w-8" />
                          <td className="px-5 py-2 text-center min-w-[88px] font-mono text-[10px] text-muted-foreground">{m.code}</td>
                          <td className="px-5 py-2 min-w-[140px] pl-8 text-xs text-muted-foreground">{t("posIngredientScopeBaseChicken") || "기본 (S Boneless)"}</td>
                          <td colSpan={4} className="px-5 py-2 text-xs text-muted-foreground">{t("posChickenBaseOnlyHint") || "메뉴 기본가에 해당. M Boneless / Wing / Drumette는 옵션 구성에서 추가."}</td>
                        </tr>
                      )
                    }
                    return null
                  }
                  return toShow.map((opt) => {
                    const optCode = resolveOptionCode(opt, m.code)
                    const optPrice = (m.price ?? 0) + (opt.priceModifier ?? 0)
                    const isOptSoldOut = !(opt.sellHall ?? true) && !(opt.sellDelivery ?? true) && !(opt.sellPackaging ?? true)
                    return (
                      <tr key={opt.id} className="bg-amber-500/5 border-b hover:bg-amber-500/10" onClick={(e) => e.stopPropagation()}>
                        <td className="px-2 py-2 w-8" />
                        <td className="px-5 py-2 text-center min-w-[88px] whitespace-nowrap">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{optCode}</span>
                        </td>
                        <td className="px-5 py-2 min-w-[140px] pl-8">
                          <span className={cn("text-sm", isOptSoldOut && "text-muted-foreground line-through")}>{optionPartLabel(opt.name)}</span>
                          {isOptSoldOut ? (
                            <span className="ml-1.5 inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {t("posMenuUnused")}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-2 text-center text-muted-foreground text-xs w-20">{m.categoryMain || "-"}</td>
                        <td className="px-5 py-2 text-center text-muted-foreground w-24">
                          {m.category ? translatePosMenuCategoryLabel(m.category, t) : "-"}
                        </td>
                        <td className="px-5 py-2 text-right font-medium tabular-nums text-xs w-24">{optPrice > 0 ? optPrice.toLocaleString() : "-"}</td>
                        <td className="px-5 py-2 w-28" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn(
                                "h-7 w-7",
                                isOptSoldOut
                                  ? "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                                  : "text-muted-foreground border-muted hover:bg-muted/50"
                              )}
                              onClick={() => handleSoldOutToggleOption(opt, m.id)}
                              disabled={soldOutTogglingOptionId === String(opt.id)}
                              title={soldOutTogglingOptionId === String(opt.id) ? "..." : isOptSoldOut ? (t("posSoldOut") || "품절") : (t("posAvailable") || "판매")}
                            >
                              {soldOutTogglingOptionId === String(opt.id) ? (
                                <span className="text-[10px]">...</span>
                              ) : isOptSoldOut ? (
                                <PauseCircle className="h-3.5 w-3.5" />
                              ) : (
                                <PlayCircle className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                              onClick={() => handleEditOptionInList(m.id)}
                              title={t("itemsBtnEdit")}
                            >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                })()
                return (
                <React.Fragment key={m.id}>
                <tr
                  data-menu-row-id={m.id}
                  className={cn(
                    "border-b cursor-pointer transition-colors",
                    isEditingRow
                      ? "bg-primary/20 hover:bg-primary/25 border-l-4 border-l-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]"
                      : "hover:bg-muted/20",
                    !isEditingRow && idx % 2 === 1 && "bg-muted/5",
                    !m.isActive && !isEditingRow && "bg-muted/40"
                  )}
                  onClick={() => handleExpandMenu(m.id)}
                >
                  <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleExpandMenu(m.id)}>
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </Button>
                  </td>
                  <td className="px-5 py-3 text-center min-w-[88px] whitespace-nowrap">
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      {m.code}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={cn(!m.isActive && "text-muted-foreground line-through")}>{m.name}</span>
                    {!m.isActive ? (
                      <span className="ml-1.5 inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {t("posMenuUnused")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-center text-muted-foreground text-xs">{m.categoryMain || "-"}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">
                    {m.category ? translatePosMenuCategoryLabel(m.category, t) : "-"}
                  </td>
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
                        className={cn(
                          "h-7 w-7",
                          !m.isActive
                            ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/40"
                            : "text-muted-foreground border-muted hover:bg-muted/50"
                        )}
                        onClick={() => handleMarkUnused(m)}
                        title={!m.isActive ? t("posMenuUseAgain") : t("posMenuUnused")}
                      >
                        {!m.isActive ? (
                          <PlayCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Ban className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedRows}
                </React.Fragment>
              )
              })
            )}
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}
