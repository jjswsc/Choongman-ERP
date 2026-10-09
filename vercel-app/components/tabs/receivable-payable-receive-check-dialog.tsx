"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type * as React from "react"

export type ReceivableReceiveCheckDialogProps = {
  handleReceiveCheckChange: (params: { receivableId: number; receiveChecked: boolean; outletStoreName: string; receiveDate?: string; }) => Promise<void>
  receiveCheckDialog: { receivableId: number; outletStoreName: string; receiveDate: string; invoiceLabel: string; } | null
  setReceiveCheckDialog: React.Dispatch<React.SetStateAction<{ receivableId: number; outletStoreName: string; receiveDate: string; invoiceLabel: string; } | null>>
  t: (k: string) => string
  tt: (key: string, fallback: string) => string
  updatingReceiveCheckId: number | null
}

export function ReceivableReceiveCheckDialog({
  handleReceiveCheckChange,
  receiveCheckDialog,
  setReceiveCheckDialog,
  t,
  tt,
  updatingReceiveCheckId,
}: ReceivableReceiveCheckDialogProps) {
  return (
    <Dialog open={receiveCheckDialog != null} onOpenChange={(open) => { if (!open && !updatingReceiveCheckId) setReceiveCheckDialog(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("recReceiveCheckDialogTitle") || tt("recReceiveCheckDialogTitle", "수금 완료 — 입금일")}</DialogTitle>
          <DialogDescription>
            {t("recReceiveCheckDialogHint") ||
              tt(
                "recReceiveCheckDialogHint",
                "매출(발생)일과 별도로 실제 입금(수령)일을 입력합니다. 저장하면 입금 행이 생성되어 매출·입금 2줄로 표시됩니다."
              )}
          </DialogDescription>
        </DialogHeader>
        {receiveCheckDialog ? (
          <div className="space-y-3 py-1">
            {receiveCheckDialog.invoiceLabel ? (
              <p className="text-sm text-muted-foreground truncate">{receiveCheckDialog.invoiceLabel}</p>
            ) : null}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {t("recLedgerReceiveDateShort") || tt("recLedgerReceiveDateShort", "입금일")}
              </label>
              <Input
                type="date"
                value={receiveCheckDialog.receiveDate}
                onChange={(e) =>
                  setReceiveCheckDialog((prev) => (prev ? { ...prev, receiveDate: e.target.value } : null))
                }
                className="h-9"
              />
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={!!updatingReceiveCheckId}
            onClick={() => setReceiveCheckDialog(null)}
          >
            {t("btnClose") || "닫기"}
          </Button>
          <Button
            type="button"
            disabled={!!updatingReceiveCheckId || !receiveCheckDialog?.receiveDate}
            onClick={() => {
              if (!receiveCheckDialog) return
              void handleReceiveCheckChange({
                receivableId: receiveCheckDialog.receivableId,
                receiveChecked: true,
                outletStoreName: receiveCheckDialog.outletStoreName,
                receiveDate: receiveCheckDialog.receiveDate,
              })
            }}
          >
            {updatingReceiveCheckId ? t("loading") : t("btnSave") || "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
