"use client"

import * as React from "react"
import { Stamp } from "lucide-react"
import type { CompanyHybridDocumentListItem } from "@/lib/api-client"
import { issueCompanyHybridDocumentWatermark } from "@/lib/api-client"
import { isCompanyHybridWatermarkSupportedDoc } from "@/lib/company-hybrid-documents-watermark-shared"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: CompanyHybridDocumentListItem | null
  t: (key: string) => string
  onUnauthorized: (httpStatus: number) => boolean
  onIssued?: () => void
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function CompanyHybridDocumentWatermarkDialog({
  open,
  onOpenChange,
  row,
  t,
  onUnauthorized,
  onIssued,
}: Props) {
  const [issuedTo, setIssuedTo] = React.useState("")
  const [purpose, setPurpose] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setIssuedTo("")
      setPurpose("")
      setBusy(false)
    }
  }, [open, row?.id])

  const supported = row ? isCompanyHybridWatermarkSupportedDoc(row) : false
  const unsupportedReason =
    row?.source === "drive"
      ? t("companyHybridDocWatermarkDriveUnsupported")
      : t("companyHybridDocWatermarkUnsupported")

  const onSubmit = async () => {
    if (!row?.id || busy) return
    if (!issuedTo.trim()) {
      void appAlert(t("companyHybridDocWatermarkIssuedToRequired"))
      return
    }
    if (!purpose.trim()) {
      void appAlert(t("companyHybridDocWatermarkPurposeRequired"))
      return
    }
    setBusy(true)
    try {
      const res = await issueCompanyHybridDocumentWatermark({
        id: row.id,
        issuedTo: issuedTo.trim(),
        purpose: purpose.trim(),
      })
      if (onUnauthorized(res.httpStatus)) return
      if (!res.success || !res.blob) {
        void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
        return
      }
      downloadBlob(res.blob, res.fileName || `document-watermarked.pdf`)
      onOpenChange(false)
      onIssued?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stamp className="h-4 w-4" />
            {t("companyHybridDocWatermarkTitle")}
          </DialogTitle>
          <DialogDescription>{t("companyHybridDocWatermarkHint")}</DialogDescription>
        </DialogHeader>

        {row && !supported ? (
          <p className="text-sm text-muted-foreground">{unsupportedReason}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hybrid-doc-watermark-issued-to">{t("companyHybridDocWatermarkIssuedTo")}</Label>
              <Input
                id="hybrid-doc-watermark-issued-to"
                value={issuedTo}
                onChange={(e) => setIssuedTo(e.target.value)}
                placeholder={t("companyHybridDocWatermarkIssuedToPlaceholder")}
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hybrid-doc-watermark-purpose">{t("companyHybridDocWatermarkPurpose")}</Label>
              <Input
                id="hybrid-doc-watermark-purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder={t("companyHybridDocWatermarkPurposePlaceholder")}
                maxLength={300}
                disabled={busy}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("companyHybridDocCancel")}
          </Button>
          {supported ? (
            <Button type="button" onClick={() => void onSubmit()} disabled={busy}>
              {busy ? t("companyHybridDocWatermarkBusy") : t("companyHybridDocWatermarkSubmit")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function canShowCompanyHybridWatermarkAction(row: CompanyHybridDocumentListItem | null | undefined): boolean {
  return !!row && isCompanyHybridWatermarkSupportedDoc(row)
}
