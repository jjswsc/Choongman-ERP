"use client"

import { useState, useCallback } from "react"
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
import { Plus, Trash2, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RecipeItem } from "@/lib/cost-data"
import { getIngredient, calculateItemCost, getRuntimeIngredients, getRuntimeSauces, getRuntimeApiItems, MISE_DEFAULT } from "@/lib/cost-data"

interface IngredientTableProps {
  title: string
  type: "food" | "packaging"
  items: RecipeItem[]
  onItemsChange: (items: RecipeItem[]) => void
}

export function IngredientTable({
  title,
  type,
  items,
  onItemsChange,
}: IngredientTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)

  const runtimeByType = getRuntimeIngredients().filter((i) => i.category === type)
  const sauceIngs = type === "food" ? getRuntimeSauces() : []
  const apiItemsByType = getRuntimeApiItems().filter((i) => i.category === type)
  const usedRuntimeCodes = new Set(runtimeByType.map((i) => i.code))
  const availableIngredients = [
    ...apiItemsByType.filter((i) => !usedRuntimeCodes.has(i.code)),
    ...runtimeByType,
    ...sauceIngs,
  ]

  const updateQuantity = useCallback(
    (index: number, quantity: number) => {
      const updated = [...items]
      updated[index] = { ...updated[index], quantity }
      onItemsChange(updated)
    },
    [items, onItemsChange]
  )

  const updateMisePercent = useCallback(
    (index: number, misePercent: number) => {
      const updated = [...items]
      updated[index] = { ...updated[index], misePercent }
      onItemsChange(updated)
    },
    [items, onItemsChange]
  )

  const addItem = useCallback(() => {
    const usedCodes = new Set(items.map((i) => i.ingredientCode))
    const nextIngredient = availableIngredients.find(
      (i) => !usedCodes.has(i.code)
    )
    if (nextIngredient) {
      onItemsChange([
        ...items,
        { ingredientCode: nextIngredient.code, quantity: 1, misePercent: MISE_DEFAULT },
      ])
    }
  }, [items, availableIngredients, onItemsChange])

  const removeItem = useCallback(
    (index: number) => {
      onItemsChange(items.filter((_, i) => i !== index))
    },
    [items, onItemsChange]
  )

  const changeIngredient = useCallback(
    (index: number, code: number) => {
      const updated = [...items]
      updated[index] = { ...updated[index], ingredientCode: code }
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
        <Button
          variant="ghost"
          size="sm"
          onClick={addItem}
          className="h-8 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("posCostAddItem")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10 text-center text-xs font-medium text-muted-foreground">
                {t("posCostNo")}
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">
                {t("posMenuCode")}
              </TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground min-w-[200px]">
                {t("posCostIngredient")}
              </TableHead>
              <TableHead className="text-right text-xs font-medium text-muted-foreground">
                {t("posCostBahtPerUnit")}
              </TableHead>
              <TableHead className="text-right text-xs font-medium text-muted-foreground w-28">
                {type === "food" ? (t("posCostQtyG") || "수량 (g)") : (t("posCostQty") || "수량")}
              </TableHead>
              <TableHead className="text-right text-xs font-medium text-muted-foreground w-20">
                {t("posCostMise")}
              </TableHead>
              <TableHead className="text-right text-xs font-medium text-muted-foreground">
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
                  <TableCell className="text-center">
                    <GripVertical className="mx-auto h-3.5 w-3.5 text-muted-foreground/40" />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {ingredient?.code ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(item.ingredientCode)}
                      onValueChange={(val) =>
                        changeIngredient(index, Number(val))
                      }
                    >
                      <SelectTrigger className="h-8 border-transparent bg-transparent text-sm hover:bg-secondary/50 focus:ring-1 focus:ring-primary/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableIngredients.map((ing) => (
                          <SelectItem key={ing.code} value={String(ing.code)}>
                            {ing.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {ingredient?.bahtPerUnit.toFixed(3) ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(index, parseFloat(e.target.value) || 0)
                      }
                      className="h-8 w-24 ml-auto text-right font-mono text-sm bg-secondary/50 border-border focus:border-primary focus:ring-1 focus:ring-primary/30"
                      step="0.1"
                      min="0"
                    />
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
                        cost > 10 ? "text-accent" : "text-foreground"
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
                  colSpan={8}
                  className="h-20 text-center text-sm text-muted-foreground"
                >
                  {t("posCostNoIngredients")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Subtotal */}
      <div className="flex items-center justify-between border-t border-border bg-secondary/30 px-5 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("posCostSubtotal")}
        </span>
        <span
          className={cn(
            "font-mono text-base font-bold",
            type === "food" ? "text-primary" : "text-accent"
          )}
        >
          {subTotal.toFixed(2)} THB
        </span>
      </div>
    </div>
  )
}
