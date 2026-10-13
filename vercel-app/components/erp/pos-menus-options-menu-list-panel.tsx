"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { getPosMenuOptions, type PosMenuOption, type PosMenu } from "@/lib/api-client"
import { RefreshCw } from "lucide-react"
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
import { isChickenMenu, isChickenDefaultOption } from "@/app/admin/pos-menus/pos-menus-page-helpers"

export interface PosMenuOptionsMenuListPanelProps {
  t: (k: string) => string
  optionsConfigListLoading: boolean
  loadMenusAndCategories: (setLoadingState?: (v: boolean) => void) => Promise<void>
  setOptionsConfigListLoading: React.Dispatch<React.SetStateAction<boolean>>
  optionsConfigSelectedMenuId: string | null
  applyLoadedOptionsForConfig: (raw: PosMenuOption[] | null | undefined) => void
  mainCategoryFilter: string
  setMainCategoryFilter: React.Dispatch<React.SetStateAction<string>>
  setOptionsConfigCategoryFilter: React.Dispatch<React.SetStateAction<string>>
  mainCategories: string[]
  optionsConfigCategoryFilter: string
  optionsConfigCategoriesByMain: string[]
  optionsConfigSearchTerm: string
  setOptionsConfigSearchTerm: React.Dispatch<React.SetStateAction<string>>
  optionsConfigFilteredMenus: PosMenu[]
  optionsConfigMenuOptions: PosMenuOption[]
  setOptionsConfigSelectedMenuId: React.Dispatch<React.SetStateAction<string | null>>
}

export function PosMenuOptionsMenuListPanel({
  t,
  optionsConfigListLoading,
  loadMenusAndCategories,
  setOptionsConfigListLoading,
  optionsConfigSelectedMenuId,
  applyLoadedOptionsForConfig,
  mainCategoryFilter,
  setMainCategoryFilter,
  setOptionsConfigCategoryFilter,
  mainCategories,
  optionsConfigCategoryFilter,
  optionsConfigCategoriesByMain,
  optionsConfigSearchTerm,
  setOptionsConfigSearchTerm,
  optionsConfigFilteredMenus,
  optionsConfigMenuOptions,
  setOptionsConfigSelectedMenuId,
}: PosMenuOptionsMenuListPanelProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b px-4 py-3 bg-muted/20 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">{t("posMenuList")}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t("posMenuOptionsConfigSelectMenuHint")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0"
          disabled={optionsConfigListLoading}
          onClick={async () => {
            await loadMenusAndCategories(setOptionsConfigListLoading)
            if (optionsConfigSelectedMenuId) {
              const opts = await getPosMenuOptions({ menuId: optionsConfigSelectedMenuId })
              applyLoadedOptionsForConfig(Array.isArray(opts) ? opts : [])
            }
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", optionsConfigListLoading && "animate-spin")} />
          {t("btn_query") || "조회"}
        </Button>
      </div>
      <div className="p-3 space-y-2 border-b">
        <Select
          value={mainCategoryFilter}
          onValueChange={(v) => {
            setMainCategoryFilter(v)
            setOptionsConfigCategoryFilter("all")
          }}
        >
          <SelectTrigger className="h-9 w-full text-xs">
            <SelectValue placeholder={t("posMenuCategoryMain")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
            {mainCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={optionsConfigCategoryFilter} onValueChange={setOptionsConfigCategoryFilter}>
          <SelectTrigger className="h-9 w-full text-xs">
            <SelectValue placeholder={t("posMenuCategorySub") || "소분류"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
            {optionsConfigCategoriesByMain.map((c) => (
              <SelectItem key={c} value={c}>
                {translatePosMenuCategoryLabel(c, t)}
              </SelectItem>
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
              const optCount = isSelected
                ? isChickenMenu(m.code)
                  ? (() => {
                      const nd = optionsConfigMenuOptions.filter((o) => !isChickenDefaultOption(o.name))
                      const hasHiddenS = optionsConfigMenuOptions.some((o) => isChickenDefaultOption(o.name))
                      if (nd.length === 0 && hasHiddenS) return 1
                      return nd.length
                    })()
                  : optionsConfigMenuOptions.length
                : null
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
                      <span
                        className={cn(
                          "ml-1.5",
                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                        )}
                      >
                        ({optCount})
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
