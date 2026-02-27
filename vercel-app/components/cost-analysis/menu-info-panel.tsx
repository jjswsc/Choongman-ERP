"use client"

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
import { UtensilsCrossed, ChefHat, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MenuItem } from "@/lib/cost-data"

interface MenuInfoPanelProps {
  menuItem: MenuItem
  onMenuItemChange: (item: MenuItem) => void
  /** 카테고리 목록 (메뉴 관리에서 사용 중인 값) */
  categories?: string[]
  /** 코드·카테고리·메뉴명 읽기 전용 (pos 메뉴 관리와 연동) */
  readOnlyMenuInfo?: boolean
}

export function MenuInfoPanel({ menuItem, onMenuItemChange, categories = [], readOnlyMenuInfo = false }: MenuInfoPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const categoryOptions = categories.length > 0 ? categories : ["Size S", "Size M", "Size L", "Set"]
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
          <Label htmlFor="menuCode" className="text-xs text-muted-foreground">
            {t("posMenuCode")}
          </Label>
          {readOnlyMenuInfo ? (
            <div className="h-9 px-3 flex items-center font-mono text-sm bg-muted/30 rounded-md border border-border">
              {menuItem.menuCode || "—"}
            </div>
          ) : (
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
          )}
        </div>

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
              value={menuItem.category}
              onValueChange={(val) => onMenuItemChange({ ...menuItem, category: val })}
            >
              <SelectTrigger className="h-9 bg-secondary/50 border-border">
                <SelectValue placeholder={t("posMenuCategoryAll") || "전체"} />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="menuName" className="text-xs text-muted-foreground">
            {t("posMenuName")}
          </Label>
          {readOnlyMenuInfo ? (
            <div className="h-9 px-3 flex items-center text-sm bg-muted/30 rounded-md border border-border">
              {menuItem.menuName || "—"}
            </div>
          ) : (
            <Input
              id="menuName"
              value={menuItem.menuName}
              onChange={(e) =>
                onMenuItemChange({ ...menuItem, menuName: e.target.value })
              }
              className="h-9 bg-secondary/50 border-border"
            />
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
      </div>
    </div>
  )
}
