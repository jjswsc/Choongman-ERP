"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type * as React from "react"

export type ReceivableManualEditDialogProps = {
  canSelectStores: boolean
  formatStoreLabel: (code: string) => string
  handleManualBalanceDelete: (ledger: "receivable" | "payable", id: number) => Promise<void>
  handleManualBalanceSave: () => Promise<void>
  manualEdit: { ledger: "receivable" | "payable"; id: number; refType: string; entity: string; amount: string; date: string; memo: string; } | null
  manualEditSaving: boolean
  resolveStoreKey: (raw: string) => string
  setManualEdit: React.Dispatch<React.SetStateAction<{ ledger: "receivable" | "payable"; id: number; refType: string; entity: string; amount: string; date: string; memo: string; } | null>>
  storeList: string[]
  t: (k: string) => string
  tt: (key: string, fallback: string) => string
  vendors: { code: string; name: string; bankAccountNo?: string | null; }[]
}

export function ReceivableManualEditDialog({
  canSelectStores,
  formatStoreLabel,
  handleManualBalanceDelete,
  handleManualBalanceSave,
  manualEdit,
  manualEditSaving,
  resolveStoreKey,
  setManualEdit,
  storeList,
  t,
  tt,
  vendors,
}: ReceivableManualEditDialogProps) {
  return (
    <Dialog open={manualEdit != null} onOpenChange={(open) => { if (!open && !manualEditSaving) setManualEdit(null) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {manualEdit?.ledger === "payable"
              ? t("payManualEditTitle") || "지급·기초이월 수정"
              : t("recManualEditTitle") || "수령·기초이월 수정"}
          </DialogTitle>
          <DialogDescription>
            {t("manualBalanceEditHint") ||
              "통장·주문·발주·입고 연동 건은 이 화면에서 수정할 수 없습니다."}
          </DialogDescription>
        </DialogHeader>
        {manualEdit ? (
          <div className="space-y-3 py-1">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {manualEdit.ledger === "receivable" ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")}
              </label>
              {manualEdit.ledger === "receivable" ? (
                canSelectStores ? (
                  <Select
                    value={manualEdit.entity}
                    onValueChange={(v) => setManualEdit((prev) => (prev ? { ...prev, entity: v } : null))}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder={t("outColStore") || "매출처"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(storeList || []).map((s) => (
                        <SelectItem key={s} value={resolveStoreKey(s)}>
                          {formatStoreLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={formatStoreLabel(manualEdit.entity)} readOnly className="h-9 bg-muted/40" />
                )
              ) : (
                <Select
                  value={manualEdit.entity}
                  onValueChange={(v) => setManualEdit((prev) => (prev ? { ...prev, entity: v } : null))}
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder={t("vendor") || "매입처"} />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.code} value={v.code}>
                        {v.name || v.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs text-muted-foreground block mb-1">{t("amount") || "금액"}</label>
                <Input
                  type="number"
                  value={manualEdit.amount}
                  onChange={(e) => setManualEdit((prev) => (prev ? { ...prev, amount: e.target.value } : null))}
                  className="h-9"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs text-muted-foreground block mb-1">{t("date") || "날짜"}</label>
                <Input
                  type="date"
                  value={manualEdit.date}
                  onChange={(e) => setManualEdit((prev) => (prev ? { ...prev, date: e.target.value } : null))}
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("memo") || "메모"}</label>
              <Input
                value={manualEdit.memo}
                onChange={(e) => setManualEdit((prev) => (prev ? { ...prev, memo: e.target.value } : null))}
                className="h-9"
                placeholder={
                  manualEdit.refType === "Opening"
                    ? t("recTypeOpening") || "기초이월"
                    : manualEdit.ledger === "receivable"
                      ? tt("recReceiveMemoPh", "수령 메모")
                      : tt("recPayMemoPh", "지급 메모")
                }
              />
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-0">
          {manualEdit ? (
            <Button
              type="button"
              variant="destructive"
              disabled={manualEditSaving}
              onClick={() => void handleManualBalanceDelete(manualEdit.ledger, manualEdit.id)}
            >
              {t("delete") || "삭제"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={manualEditSaving} onClick={() => setManualEdit(null)}>
            {t("btnClose") || "닫기"}
          </Button>
          <Button type="button" disabled={manualEditSaving || !manualEdit} onClick={() => void handleManualBalanceSave()}>
            {manualEditSaving ? t("loading") : t("btnSave") || "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
