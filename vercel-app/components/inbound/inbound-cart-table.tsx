"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { LogisticsEmptyState } from "@/components/erp/logistics-ui"
import { ADMIN_BTN_XS_CN, ADMIN_NUMERIC_CN } from "@/lib/admin-ui-standards"
import { Package } from "lucide-react"

export type InboundCartLine = {
  date: string
  vendor: string
  code: string
  name: string
  spec: string
  qty: string
  cost: string
}

type InboundCartTableProps = {
  cart: InboundCartLine[]
  fromPoId?: number | null
  saving?: boolean
  onUpdateCost: (idx: number, cost: string) => void
  onRemove: (idx: number) => void
  onSave: () => void
}

export function InboundCartTable({
  cart,
  fromPoId,
  saving = false,
  onUpdateCost,
  onRemove,
  onSave,
}: InboundCartTableProps) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">{t("inWaitList")}</h3>
          <Badge variant="secondary" className="tabular-nums text-[10px]">
            {cart.length}
          </Badge>
          {fromPoId ? (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
              {t("inFromPO")} #{fromPoId}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr className="border-b">
              <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted-foreground">
                {t("inColItem")}
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground w-20">
                {t("inColQty")}
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground w-24">
                {t("inColCost")}
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground w-24">
                {t("inColAmount")}
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {cart.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <LogisticsEmptyState
                    icon={Package}
                    title={t("inEmptyList")}
                    className="border-0 bg-transparent py-10"
                  />
                </td>
              </tr>
            ) : (
              cart.map((c, idx) => {
                const qtyNum = parseFloat(String(c.qty).replace(/,/g, "")) || 0
                const costNum = parseFloat(String(c.cost).replace(/,/g, "")) || 0
                const amount = qtyNum * costNum
                return (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      {c.name}
                      {c.spec ? ` (${c.spec})` : ""}
                    </td>
                    <td className={cnAmount()}>{c.qty}</td>
                    <td className="px-3 py-2.5">
                      <Input
                        type="number"
                        value={c.cost}
                        onChange={(e) => onUpdateCost(idx, e.target.value)}
                        className="h-8 w-full min-w-[80px] text-right text-sm"
                        min={0}
                        step="0.01"
                      />
                    </td>
                    <td className={cnAmount()}>
                      {amount.toLocaleString()}
                      {lang === "th" ? " THB" : ""}
                    </td>
                    <td className="px-2 py-2.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`${ADMIN_BTN_XS_CN} text-destructive hover:text-destructive`}
                        onClick={() => onRemove(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        <span className="sr-only">{t("delete")}</span>
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t px-5 py-4">
        <Button className="w-full" onClick={onSave} disabled={saving || !cart.length}>
          {saving ? t("loading") : t("inSave")}
        </Button>
      </div>
    </div>
  )
}

function cnAmount() {
  return `px-3 py-2.5 text-right text-sm font-medium ${ADMIN_NUMERIC_CN}`
}
