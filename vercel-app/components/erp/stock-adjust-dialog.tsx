"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { StockStatusItem } from "@/lib/api-client"

interface StockAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: StockStatusItem | null
  onConfirm: (diffQty: number, memo?: string) => Promise<void>
}

/** 표준 단위만 사용. (totalQuantity) [unit] = 1 규격 → 입력 ÷ totalQuantity = 규격 수 */
type UnitOption = { kind: "spec" } | { kind: "standard"; unit: string; totalQuantity: number }

function getUnitOptions(item: StockStatusItem | null): UnitOption[] {
  if (!item) return []
  const std = item.standardUnits || []
  if (std.length === 0) return []
  return [{ kind: "spec" }, ...std.filter((o) => (o.unit || "").trim() && o.totalQuantity > 0).map((o) => ({ kind: "standard" as const, unit: o.unit, totalQuantity: o.totalQuantity }))]
}

function parseUnitKey(unitKey: string, unitOptions: UnitOption[]): UnitOption | null {
  if (!unitKey) return unitOptions[0] ?? null
  if (unitKey === "spec") return { kind: "spec" }
  const [unit, tqStr] = unitKey.split("::")
  const tq = Number(tqStr)
  return unit && !isNaN(tq) ? { kind: "standard", unit, totalQuantity: tq } : (unitOptions[0] ?? null)
}

function rowToSpecQty(unitKey: string, qtyStr: string, unitOptions: UnitOption[]): number {
  const n = Number(qtyStr)
  if (isNaN(n) || n === 0) return 0
  const opt = parseUnitKey(unitKey, unitOptions)
  if (opt?.kind === "standard") return n / opt.totalQuantity
  return n
}

type AdjustRow = { unitKey: string; qty: string }

const defaultRow = (unitOptions: UnitOption[]): AdjustRow => ({
  unitKey: unitOptions.length > 0 ? (unitOptions[0].kind === "spec" ? "spec" : `${unitOptions[0].unit}::${unitOptions[0].totalQuantity}`) : "spec",
  qty: "",
})

export function StockAdjustDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
}: StockAdjustDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<AdjustRow[]>(() => [defaultRow([])])
  const [memo, setMemo] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const unitOptions = React.useMemo(() => getUnitOptions(item), [item])

  React.useEffect(() => {
    if (open) {
      setMemo("")
      setRows([defaultRow(unitOptions)])
    }
  }, [open, item?.code, unitOptions])

  const addRow = () => setRows((prev) => [...prev, defaultRow(unitOptions)])
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx))
  const setRow = (idx: number, upd: Partial<AdjustRow>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...upd } : r)))

  const totalSpecQty = React.useMemo(() => {
    return rows.reduce((sum, r) => sum + rowToSpecQty(r.unitKey, r.qty, unitOptions), 0)
  }, [rows, unitOptions])

  const handleConfirm = async () => {
    if (!item) return
    const rounded = Math.round(totalSpecQty * 1e6) / 1e6
    if (rounded === 0) {
      await appAlert(t("stockAdjustQtyRequired"))
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(rounded, memo.trim() || undefined)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-0 p-5 sm:max-w-md"
        hideCloseButton
        onPointerDownOutside={(e) => {
          if (submitting) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (submitting) e.preventDefault()
        }}
      >
        <DialogHeader className="space-y-0 pb-4 text-left">
          <DialogTitle className="text-sm font-bold">{t("stockAdjustTitle")}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4">
            <div className="text-sm">
              <span className="font-semibold text-muted-foreground">{t("stockColCode")}:</span>{" "}
              {item.code} | <span className="font-semibold text-muted-foreground">{t("stockColName")}:</span>{" "}
              {item.name}
            </div>
            <div className="text-sm">
              <span className="font-semibold text-muted-foreground">{t("stockAdjustCurrent")}:</span>{" "}
              {item.qty.toLocaleString()}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">{t("stockAdjustDiff")}</label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={addRow}>
                  <Plus className="h-3 w-3" />
                  {t("itemsAdd") || "추가"}
                </Button>
              </div>
              <div className="max-h-[200px] space-y-2 overflow-y-auto">
                {rows.map((row, idx) => {
                  const opt = parseUnitKey(row.unitKey, unitOptions)
                  return (
                    <div key={idx} className="flex flex-nowrap items-center gap-2">
                      {unitOptions.length > 0 && (
                        <Select value={row.unitKey} onValueChange={(v) => setRow(idx, { unitKey: v })}>
                          <SelectTrigger className="h-9 w-[140px] min-w-[140px] shrink-0 overflow-hidden text-left text-sm">
                            <SelectValue placeholder={t("stockAdjustUnit") || "단위"} />
                          </SelectTrigger>
                          <SelectContent>
                            {unitOptions.map((o) => {
                              const val = o.kind === "spec" ? "spec" : `${o.unit}::${o.totalQuantity}`
                              const label =
                                o.kind === "spec"
                                  ? (t("stockAdjustUnitSpec") || "규격 (1개)")
                                  : `${o.unit} (${o.totalQuantity} = 1 ${t("specUnit") || "규격"})`
                              return (
                                <SelectItem key={val} value={val}>
                                  {label}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        type="number"
                        step={opt?.kind === "standard" ? "any" : "1"}
                        placeholder={t("stockAdjustDiffPh") || "+10 또는 -5"}
                        value={row.qty}
                        onChange={(e) => setRow(idx, { qty: e.target.value })}
                        className="h-9 w-28 min-w-[7rem] shrink-0 text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive"
                        onClick={() => removeRow(idx)}
                        aria-label={t("cancel")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">{t("stockAdjustHint")}</p>
              {rows.length >= 2 && (
                <p className="text-xs font-medium text-foreground">
                  {t("stockAdjustTotalLabel") || "합계"}:{" "}
                  <span className="font-semibold tabular-nums text-primary">{Math.round(totalSpecQty * 1e4) / 1e4}</span>{" "}
                  {t("specUnit") || "규격"}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold">{t("stockAdjustMemo")}</label>
              <Input
                placeholder={t("stockAdjustMemoPh")}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        )}
        <DialogFooter className="mt-5 flex-row justify-end gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? t("loading") : t("stockAdjustConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
