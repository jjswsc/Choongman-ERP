"use client"

import * as React from "react"
import { BookMarked, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  deleteStorePurchaseJournal,
  getStorePurchaseJournal,
  type StorePurchaseJournalEntry,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"

type StorePurchaseJournalDialogProps = {
  open: boolean
  orderId: number
  invoiceLabel?: string
  t: (key: string) => string
  tt: (key: string, fallback: string) => string
  onClose: () => void
  onDeleted?: () => void
}

function formatAmount2(n: number): string {
  const x = Number(n)
  if (!Number.isFinite(x)) return "0.00"
  return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function StorePurchaseJournalDialog({
  open,
  orderId,
  invoiceLabel,
  t,
  tt,
  onClose,
  onDeleted,
}: StorePurchaseJournalDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [entries, setEntries] = React.useState<StorePurchaseJournalEntry[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || orderId <= 0) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setEntries([])
    void getStorePurchaseJournal({ orderId })
      .then((res) => {
        if (cancelled) return
        if (!res.success) {
          setLoadError(translateApiMessage(res.message, t) || res.message || t("processFail"))
          return
        }
        setEntries(res.entries || [])
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, orderId, t])

  const handleDelete = React.useCallback(async () => {
    if (entries.length === 0) return
    const ok = await appConfirm(
      tt(
        "recStorePurchaseJournalDeleteConfirm",
        "주문 #{orderId}의 매장 매입 분개 {count}건을 삭제할까요? 삭제 후 물류팀이 출고 이력에서 IV를 삭제할 수 있습니다."
      )
        .replace("{orderId}", String(orderId))
        .replace("{count}", String(entries.length))
    )
    if (!ok) return
    setDeleting(true)
    try {
      const res = await deleteStorePurchaseJournal({ orderId })
      if (res.success) {
        await appAlert(
          translateApiMessage(res.message, t) ||
            tt(
              "recStorePurchaseJournalDeleted",
              "분개가 삭제되었습니다. 물류팀에 출고 이력 삭제를 요청하세요."
            )
        )
        onDeleted?.()
        onClose()
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDeleting(false)
    }
  }, [entries.length, onClose, onDeleted, orderId, t, tt])

  const label = invoiceLabel || `#${orderId}`

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tt("recStorePurchaseJournalDialogTitle", "매장 매입 분개")}</DialogTitle>
          <DialogDescription>
            {tt("recStorePurchaseJournalDialogDesc", "매장 수령 시 자동 생성된 store_purchase 분개입니다.")}
            <span className="mt-1 block font-medium text-foreground">{label}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("msg_loading") || "Loading…"}
          </div>
        ) : loadError ? (
          <p className="py-4 text-sm text-destructive">{loadError}</p>
        ) : entries.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {tt("recStorePurchaseJournalNone", "이 주문에 연결된 store_purchase 분개가 없습니다.")}
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border/70 p-3 text-sm">
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                  <span className="font-mono text-foreground">{entry.entryNo}</span>
                  <span>{entry.accountingDate}</span>
                  {entry.storeName ? <span>{entry.storeName}</span> : null}
                </div>
                {entry.memo ? <p className="text-xs text-muted-foreground mb-2">{entry.memo}</p> : null}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-2">{t("code") || "Code"}</th>
                      <th className="text-left py-1 pr-2">{t("account") || "Account"}</th>
                      <th className="text-center py-1 pr-2">D/C</th>
                      <th className="text-right py-1">{t("amount") || "Amount"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line, idx) => (
                      <tr key={`${line.accountCode}-${line.side}-${idx}`} className="border-b border-border/40">
                        <td className="py-1 pr-2 font-mono">{line.accountCode}</td>
                        <td className="py-1 pr-2">{line.accountName}</td>
                        <td className="py-1 pr-2 text-center">{line.side === "debit" ? "D" : "C"}</td>
                        <td className="py-1 text-right tabular-nums">฿{formatAmount2(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>
            {t("close") || "Close"}
          </Button>
          {entries.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting || loading}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-1">{t("delete") || "Delete"}</span>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type StorePurchaseJournalButtonProps = {
  orderId: number
  invoiceLabel?: string
  t: (key: string) => string
  tt: (key: string, fallback: string) => string
  onDeleted?: () => void
  className?: string
}

export function StorePurchaseJournalButton({
  orderId,
  invoiceLabel,
  t,
  tt,
  onDeleted,
  className,
}: StorePurchaseJournalButtonProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className || "h-8 w-8 p-0 shrink-0"}
        title={tt("recStorePurchaseJournalBtnTitle", "매장 매입 분개 (store_purchase) 조회·삭제")}
        aria-label={tt("recStorePurchaseJournalBtnTitle", "매장 매입 분개 (store_purchase) 조회·삭제")}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <BookMarked className="h-4 w-4" />
      </Button>
      <StorePurchaseJournalDialog
        open={open}
        orderId={orderId}
        invoiceLabel={invoiceLabel}
        t={t}
        tt={tt}
        onClose={() => setOpen(false)}
        onDeleted={onDeleted}
      />
    </>
  )
}
