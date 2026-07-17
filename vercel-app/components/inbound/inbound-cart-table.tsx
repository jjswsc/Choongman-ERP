"use client"

import * as React from "react"
import { Trash2, Package } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { LogisticsEmptyState } from "@/components/erp/logistics-ui"
import { ADMIN_BTN_XS_CN, ADMIN_NUMERIC_CN, ADMIN_TABLE_SCROLL_PANEL_SM_CN } from "@/lib/admin-ui-standards"
import { formatErpNum, normalizeErpDecimalInput, roundErp3, formatErpCostInputString } from "@/lib/utils"

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
  /** 수정 모드 배치 ID — 표시·저장 문구용 */
  editingBatchId?: number | null
  saving?: boolean
  /** 공급가 / VAT / 합계 (VAT 포함) — 페이지에서 계산해 전달 */
  totals?: { net: number; vat: number; gross: number } | null
  onUpdateCost: (idx: number, cost: string) => void
  onUpdateQty?: (idx: number, qty: string) => void
  onRemove: (idx: number) => void
  onSave: () => void
  onCancelEdit?: () => void
}

export function InboundCartTable({
  cart,
  fromPoId,
  editingBatchId = null,
  saving = false,
  totals = null,
  onUpdateCost,
  onUpdateQty,
  onRemove,
  onSave,
  onCancelEdit,
}: InboundCartTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const isEdit = !!editingBatchId

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold">{isEdit ? t("inEditWaitList") : t("inWaitList")}</h3>
          <Badge variant="secondary" className="tabular-nums text-[10px]">
            {cart.length}
          </Badge>
          {isEdit ? (
            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-500/40">
              {t("inEditModeBadge").replace("{id}", String(editingBatchId))}
            </Badge>
          ) : null}
          {fromPoId ? (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
              {t("inFromPO")} #{fromPoId}
            </Badge>
          ) : null}
        </div>
        {isEdit && onCancelEdit ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancelEdit} disabled={saving}>
            {t("inCancelEdit")}
          </Button>
        ) : null}
      </div>

      <div className={ADMIN_TABLE_SCROLL_PANEL_SM_CN}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr className="border-b">
              <th className="px-4 py-2.5 text-left text-[11px] font-bold text-muted-foreground">
                {t("inColItem")}
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground w-24">
                {t("inColQty")}
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground w-28">
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
                const amount = roundErp3(qtyNum * costNum)
                return (
                  <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      {c.name}
                      {c.spec ? ` (${c.spec})` : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      {onUpdateQty ? (
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={c.qty}
                          onChange={(e) => onUpdateQty(idx, normalizeErpDecimalInput(e.target.value))}
                          className="h-8 w-full min-w-[64px] text-right text-sm"
                        />
                      ) : (
                        <span className={cnAmountInner()}>{c.qty}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={c.cost}
                        onChange={(e) => onUpdateCost(idx, normalizeErpDecimalInput(e.target.value))}
                        onBlur={() => {
                          const normalized = formatErpCostInputString(c.cost)
                          if (normalized !== c.cost) onUpdateCost(idx, normalized)
                        }}
                        className="h-8 w-full min-w-[80px] text-right text-sm"
                      />
                    </td>
                    <td className={cnAmount()}>
                      {formatErpNum(amount)}
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

      {totals && cart.length > 0 ? (
        <div className="border-t px-5 py-3 bg-muted/30 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("salesSupplyAmount")}</span>
            <span className={ADMIN_NUMERIC_CN}>฿{formatErpNum(totals.net)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("posVatLabel")}</span>
            <span className={ADMIN_NUMERIC_CN}>฿{formatErpNum(totals.vat)}</span>
          </div>
          <div className="flex justify-between font-semibold text-sm pt-0.5">
            <span>{t("inv_total") || t("total")}</span>
            <span className={ADMIN_NUMERIC_CN}>฿{formatErpNum(totals.gross)}</span>
          </div>
          {isEdit ? (
            <p className="pt-1 text-[11px] text-muted-foreground leading-snug">{t("inEditDecimalHint")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="border-t px-5 py-4">
        <Button className="w-full" onClick={onSave} disabled={saving || !cart.length}>
          {saving ? t("loading") : isEdit ? t("inUpdateSave") : t("inSave")}
        </Button>
      </div>
    </div>
  )
}

function cnAmount() {
  return `px-3 py-2.5 text-right text-sm font-medium ${ADMIN_NUMERIC_CN}`
}

function cnAmountInner() {
  return `block text-right text-sm font-medium ${ADMIN_NUMERIC_CN}`
}
