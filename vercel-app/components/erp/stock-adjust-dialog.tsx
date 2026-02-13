"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { StockStatusItem } from "@/lib/api-client"

interface StockAdjustDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: StockStatusItem | null
  onConfirm: (diffQty: number, memo?: string) => Promise<void>
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  item,
  onConfirm,
}: StockAdjustDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [diffQty, setDiffQty] = React.useState("")
  const [memo, setMemo] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setDiffQty("")
      setMemo("")
    }
  }, [open])

  const handleConfirm = async () => {
    if (!item) return
    const n = Number(diffQty)
    if (isNaN(n) || n === 0) {
      alert(t("stockAdjustQtyRequired"))
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(n, memo.trim() || undefined)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-bold">{t("stockAdjustTitle")}</h3>
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
              <label className="text-xs font-semibold">{t("stockAdjustDiff")}</label>
              <Input
                type="number"
                placeholder={t("stockAdjustDiffPh") || "+10 또는 -5"}
                value={diffQty}
                onChange={(e) => setDiffQty(e.target.value)}
                className="text-sm"
              />
              <p className="text-[11px] text-muted-foreground">{t("stockAdjustHint")}</p>
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
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={submitting}>
            {submitting ? t("loading") : t("stockAdjustConfirm")}
          </Button>
        </div>
      </div>
    </div>
  )
}
