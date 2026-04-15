"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  getInboundBatchesForLink,
  getBankTransactionInboundLinks,
  saveBankTransactionInboundLinks,
  type InboundBatchForLink,
} from "@/lib/api-client"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

type BankRow = {
  id?: number
  amount: number
  vendorCode?: string
  memo?: string
  transDate?: string
}

interface BankInboundLinkDialogProps {
  row: BankRow | null
  vendorOptions: { code: string; name: string }[]
  /** 선택된 통장 계좌의 매장 - 매장별 입고 배치 필터용 */
  storeFilter?: string
  onClose: () => void
  onSaved?: () => void
}

export function BankInboundLinkDialog({
  row,
  vendorOptions,
  storeFilter,
  onClose,
  onSaved,
}: BankInboundLinkDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const [vendorCode, setVendorCode] = React.useState("")
  const [vendorSearch, setVendorSearch] = React.useState("")
  const [batches, setBatches] = React.useState<InboundBatchForLink[]>([])
  const [, setExistingLinks] = React.useState<{ inboundBatchId?: number; amount: number }[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [amounts, setAmounts] = React.useState<Record<number, number>>({})

  const effectiveVendor = (row?.vendorCode?.trim() || vendorCode?.trim() || "").trim()
  const withdrawAmount = row && row.amount < 0 ? Math.abs(row.amount) : 0
  const allocatedSum = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0)
  const isMatch = withdrawAmount > 0 && allocatedSum > 0 && Math.abs(allocatedSum - withdrawAmount) < 1
  const canSave = effectiveVendor && allocatedSum > 0 && !saving

  React.useEffect(() => {
    if (!row?.id || !effectiveVendor) {
      setBatches([])
      setAmounts({})
      setExistingLinks([])
      return
    }
    setLoading(true)
    Promise.all([
      getInboundBatchesForLink({ vendorCode: effectiveVendor, storeFilter }),
      getBankTransactionInboundLinks(row.id),
    ])
      .then(([batchesRes, links]) => {
        setBatches(batchesRes || [])
        setExistingLinks(links || [])
        const init: Record<number, number> = {}
        for (const l of links || []) {
          if (l.inboundBatchId && l.amount > 0) init[l.inboundBatchId] = l.amount
        }
        setAmounts(init)
      })
      .finally(() => setLoading(false))
  }, [row?.id, effectiveVendor, storeFilter])

  React.useEffect(() => {
    if (row?.vendorCode?.trim()) setVendorCode(row.vendorCode)
    else setVendorCode("")
  }, [row?.vendorCode])

  const handleAmountChange = (batchId: number, value: string) => {
    const num = parseInt(String(value).replace(/\D/g, ""), 10) || 0
    setAmounts((prev) => ({ ...prev, [batchId]: num }))
  }

  const handleSave = async () => {
    if (!row?.id || !canSave) return
    setSaving(true)
    try {
      const links = Object.entries(amounts)
        .filter(([, amt]) => amt > 0)
        .map(([batchId, amount]) => ({ inboundBatchId: parseInt(batchId, 10), amount }))
      const res = await saveBankTransactionInboundLinks({ bankTransactionId: row.id, links })
      if (res?.success) {
        onSaved?.()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  const open = !!row
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("adminInbound") || "입고"} 연동</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {tt("withdrawalAmountLabel", "Withdrawal amount")}: <strong className="text-foreground">{(withdrawAmount || 0).toLocaleString()} ฿</strong>
                {row.transDate && ` (${row.transDate})`}
              </span>
            </div>

            {!row.vendorCode?.trim() && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{tt("vendor", "Vendor")}</label>
                <Select
                  value={vendorCode || "__none__"}
                  onValueChange={(v) => setVendorCode(v === "__none__" ? "" : v)}
                  onOpenChange={(open) => !open && setVendorSearch("")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={tt("inSelectVendor", "Select vendor")} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                      <Input
                        placeholder={tt("search", "Search")}
                        value={vendorSearch}
                        onChange={(e) => setVendorSearch(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <SelectItem value="__none__">—</SelectItem>
                    {vendorOptions
                      .filter((v) => !vendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(vendorSearch.trim().toLowerCase()))
                      .map((v) => (
                        <SelectItem key={v.code} value={v.code}>
                          {v.name} ({v.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {effectiveVendor && (
              <>
                {loading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{tt("loading", "Loading...")}</p>
                ) : batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tt("inboundNoBatches", "No inbound batches for this vendor.")}</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-muted-foreground block">{tt("inboundAllocationByBatch", "Allocate payment by inbound batch")}</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          if (!row?.id || !effectiveVendor) return
                          setLoading(true)
                          Promise.all([
                            getInboundBatchesForLink({ vendorCode: effectiveVendor, storeFilter }),
                            getBankTransactionInboundLinks(row.id),
                          ])
                            .then(([batchesRes, links]) => {
                              setBatches(batchesRes || [])
                              setExistingLinks(links || [])
                              const init: Record<number, number> = {}
                              for (const l of links || []) {
                                if (l.inboundBatchId && l.amount > 0) init[l.inboundBatchId] = l.amount
                              }
                              setAmounts(init)
                            })
                            .finally(() => setLoading(false))
                        }}
                        disabled={loading}
                      >
                        {tt("store_refresh", "Refresh")}
                      </Button>
                    </div>
                    <div className="border rounded-md divide-y max-h-[260px] overflow-y-auto">
                      {batches.map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-2 p-2">
                          <div className="flex-1 min-w-0 text-sm">
                            <span>{b.batchDate}</span>
                            <span className="text-muted-foreground ml-2">
                              {b.vendorName} · {(b.totalAmount || 0).toLocaleString()} ฿
                            </span>
                          </div>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={amounts[b.id] ? String(amounts[b.id]) : ""}
                            onChange={(e) => handleAmountChange(b.id, e.target.value)}
                            className="w-24 text-right"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm pt-1">
                      <span className="text-muted-foreground">{tt("inboundAllocatedSum", "Allocated total")}</span>
                      <span className={isMatch ? "text-green-600 font-medium" : "text-amber-600"}>
                        {allocatedSum.toLocaleString()} ฿
                        {withdrawAmount > 0 && (
                          <span className="text-muted-foreground ml-1">
                            {isMatch ? " ✓" : ` (${tt("inboundDiffFromWithdrawal", "diff from withdrawal")} ${Math.abs(allocatedSum - withdrawAmount).toLocaleString()} ฿)`}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!canSave}>
                {saving ? "..." : t("msg_done")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
