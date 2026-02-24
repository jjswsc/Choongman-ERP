"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { InboundTableRow } from "./inbound-table"

interface InboundEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: InboundTableRow | null
  onSaved: () => void
  onFetchBatch: (batchId: number) => Promise<{ vendorName: string; vendorCode?: string; poNo?: string; invoiceNo?: string } | null>
  onSave: (params: { batchId: number; vendorName?: string; vendorCode?: string; poNo?: string; invoiceNo?: string }) => Promise<boolean>
}

export function InboundEditDialog({
  open,
  onOpenChange,
  row,
  onSaved,
  onFetchBatch,
  onSave,
}: InboundEditDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [vendorName, setVendorName] = React.useState("")
  const [poNo, setPoNo] = React.useState("")
  const [invoiceNo, setInvoiceNo] = React.useState("")

  React.useEffect(() => {
    if (open && row?.inboundBatchId) {
      setLoading(true)
      onFetchBatch(row.inboundBatchId)
        .then((b) => {
          if (b) {
            setVendorName(b.vendorName || "")
            setPoNo(b.poNo || "")
            setInvoiceNo(b.invoiceNo || "")
          }
        })
        .finally(() => setLoading(false))
    }
  }, [open, row?.inboundBatchId, onFetchBatch])

  const handleSave = async () => {
    if (!row?.inboundBatchId) return
    setSaving(true)
    try {
      const ok = await onSave({
        batchId: row.inboundBatchId,
        vendorName: vendorName.trim() || undefined,
        poNo: poNo.trim() || undefined,
        invoiceNo: invoiceNo.trim() || undefined,
      })
      if (ok) {
        onSaved()
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit") || "수정"} – {t("adminInbound")}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="space-y-4 py-2">
            {row && (
              <p className="text-xs text-muted-foreground">
                {row.date} · {row.vendor} · ฿{row.totalAmt.toLocaleString()}
              </p>
            )}
            <div>
              <label className="text-xs font-semibold">{t("inVendor")}</label>
              <Input
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="mt-1 h-9"
                placeholder={t("inVendorPlaceholder")}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">{t("inPoNo") || "PO 번호"}</label>
              <Input
                value={poNo}
                onChange={(e) => setPoNo(e.target.value)}
                className="mt-1 h-9"
                placeholder="PO-2024-001"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">{t("inInvoiceNo") || "인보이스 번호"}</label>
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="mt-1 h-9"
                placeholder="INV-001"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? t("loading") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
