"use client"

import * as React from "react"
import { Calculator, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getPosMenus, getPosMenuOptions, getMenuCost } from "@/lib/api-client"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type SimItem = { menuId: string; optionId: string | null; qty: number; menuName: string; optionName?: string; unitPrice: number }

export function PromoSetSimulator({ onClose }: { onClose?: () => void }) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [options, setOptions] = React.useState<PosMenuOption[]>([])
  const [items, setItems] = React.useState<SimItem[]>([])
  const [costs, setCosts] = React.useState<Record<string, number>>({})
  const [salePrice, setSalePrice] = React.useState("")
  const [discountPercent, setDiscountPercent] = React.useState("")
  const [targetOrders, setTargetOrders] = React.useState("")

  const optionsByMenu = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of options) {
      const mid = String(o.menuId ?? "")
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [options])

  React.useEffect(() => {
    getPosMenus().then((list) => setMenus((list || []).filter((m) => m.isActive)))
    getPosMenuOptions().then((list) => setOptions(list || []))
  }, [])

  React.useEffect(() => {
    for (const it of items) {
      const key = `${it.menuId}:${it.optionId || "null"}`
      if (costs[key] != null) continue
      getMenuCost({ menuId: it.menuId, optionId: it.optionId || undefined })
        .then((r) => setCosts((c) => ({ ...c, [key]: (r as { costHall?: number }).costHall ?? r.cost ?? 0 })))
        .catch(() => setCosts((c) => ({ ...c, [key]: 0 })))
    }
  }, [items])

  const addItem = (menuId: string, optionId: string | null, qty: number) => {
    const m = menus.find((x) => String(x.id) === menuId)
    const opts = optionsByMenu[menuId] || []
    const opt = optionId ? opts.find((x) => String(x.id) === optionId) : null
    const unitPrice = (m?.price ?? 0) + (opt?.priceModifier ?? 0)
    setItems((prev) => [
      ...prev,
      {
        menuId,
        optionId,
        qty,
        menuName: m?.name ?? "?",
        optionName: opt?.name,
        unitPrice,
      },
    ])
  }

  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i))

  const regularPriceSum = items.reduce((s, it) => s + it.unitPrice * it.qty, 0)
  const costTotal = items.reduce((s, it) => {
    const key = `${it.menuId}:${it.optionId || "null"}`
    return s + (costs[key] ?? 0) * it.qty
  }, 0)
  const hasAllCosts = items.every((it) => costs[`${it.menuId}:${it.optionId || "null"}`] != null)

  const salePriceNum = salePrice ? Number(salePrice) : null
  const discountNum = discountPercent ? Number(discountPercent) : null
  const finalSalePrice =
    salePriceNum != null ? salePriceNum : discountNum != null ? regularPriceSum * (1 - discountNum / 100) : regularPriceSum
  const marginBaht = finalSalePrice - costTotal
  const marginPercent = finalSalePrice > 0 ? (marginBaht / finalSalePrice) * 100 : 0
  const targetNum = targetOrders ? Number(targetOrders) : 0
  const targetProfit = marginBaht * targetNum

  const [newMenuId, setNewMenuId] = React.useState("")
  const [newOptionId, setNewOptionId] = React.useState<string | null>(null)
  const [newQty, setNewQty] = React.useState("1")

  const handleAdd = () => {
    if (!newMenuId) return
    addItem(newMenuId, newOptionId, Math.max(1, parseInt(newQty, 10) || 1))
    setNewMenuId("")
    setNewOptionId(null)
    setNewQty("1")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border bg-card p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {t("posPromoSimulatorTitle")}
          </h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("posPromoSimulatorClose")}
            </Button>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={newMenuId} onValueChange={(v) => { setNewMenuId(v); setNewOptionId(null) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("posPromoSelectMenu")} />
              </SelectTrigger>
              <SelectContent>
                {menus.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name} (฿{m.price})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newOptionId ?? "_"} onValueChange={(v) => setNewOptionId(v === "_" ? null : v)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder={t("posPromoSelectOption")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">{t("posPromoSimulatorOptionNone")}</SelectItem>
                {(optionsByMenu[newMenuId] || []).map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              className="w-16"
              placeholder={t("posPromoSimulatorQty")}
            />
            <Button size="sm" onClick={handleAdd} disabled={!newMenuId}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {items.length > 0 && (
            <div className="rounded border p-2 space-y-1 max-h-32 overflow-auto">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {it.menuName}
                    {it.optionName && ` (${it.optionName})`} × {it.qty} = ฿{(it.unitPrice * it.qty).toLocaleString()}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeItem(i)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <label className="text-muted-foreground">{t("posPromoSimulatorSetPrice")}</label>
              <Input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder={t("posPromoSimulatorPlaceholderSalePrice")}
              />
            </div>
            <div>
              <label className="text-muted-foreground">{t("posPromoSimulatorDiscountPct")}</label>
              <Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-muted-foreground">{t("posPromoSimulatorTargetOrders")}</label>
              <Input type="number" value={targetOrders} onChange={(e) => setTargetOrders(e.target.value)} placeholder="0" />
            </div>
          </div>
          {items.length > 0 && (
            <div className={cn("rounded-lg border p-3 space-y-1", !hasAllCosts && "opacity-70")}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("posPromoSimulatorRegularSum")}</span>
                <span className="font-mono">฿{regularPriceSum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("posPromoSimulatorCostSum")}</span>
                <span className="font-mono">{hasAllCosts ? `฿${costTotal.toFixed(1)}` : t("posPromoSimulatorCalculating")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("posPromoSimulatorSetSalePrice")}</span>
                <span className="font-mono">฿{Math.round(finalSalePrice).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t("posPromoSimulatorMargin")}</span>
                <span className={marginBaht >= 0 ? "text-green-600" : "text-destructive"}>
                  ฿{marginBaht.toFixed(1)} ({marginPercent.toFixed(1)}%)
                </span>
              </div>
              {targetNum > 0 && (
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">
                    {t("posPromoSimulatorTargetProfit").replace(/\{n\}/g, String(targetNum))}
                  </span>
                  <span className="font-semibold">฿{targetProfit.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
