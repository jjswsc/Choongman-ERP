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
import { UtensilsCrossed } from "lucide-react"
import type { MenuItem } from "@/lib/cost-data"

interface MenuInfoPanelProps {
  menuItem: MenuItem
  onMenuItemChange: (item: MenuItem) => void
}

export function MenuInfoPanel({ menuItem, onMenuItemChange }: MenuInfoPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
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
          <Label htmlFor="itemNo" className="text-xs text-muted-foreground">
            {t("posCostItemNo")}
          </Label>
          <Input
            id="itemNo"
            type="number"
            value={menuItem.itemNo}
            onChange={(e) =>
              onMenuItemChange({ ...menuItem, itemNo: parseInt(e.target.value) || 0 })
            }
            className="h-9 font-mono bg-secondary/50 border-border"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-xs text-muted-foreground">
            {t("posMenuCategory")}
          </Label>
          <Select
            value={menuItem.category}
            onValueChange={(val) => onMenuItemChange({ ...menuItem, category: val })}
          >
            <SelectTrigger className="h-9 bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Size S">Size S</SelectItem>
              <SelectItem value="Size M">Size M</SelectItem>
              <SelectItem value="Size L">Size L</SelectItem>
              <SelectItem value="Set">Set</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="menuName" className="text-xs text-muted-foreground">
            {t("posMenuName")}
          </Label>
          <Input
            id="menuName"
            value={menuItem.menuName}
            onChange={(e) =>
              onMenuItemChange({ ...menuItem, menuName: e.target.value })
            }
            className="h-9 bg-secondary/50 border-border"
          />
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
          <Label htmlFor="serviceType" className="text-xs text-muted-foreground">
            {t("posCostServiceType")}
          </Label>
          <Select
            value={menuItem.serviceType}
            onValueChange={(val) =>
              onMenuItemChange({
                ...menuItem,
                serviceType: val as "Dine-In" | "Delivery",
              })
            }
          >
            <SelectTrigger className="h-9 bg-secondary/50 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Dine-In">{t("posCostDineIn")}</SelectItem>
              <SelectItem value="Delivery">{t("posCostDelivery")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
