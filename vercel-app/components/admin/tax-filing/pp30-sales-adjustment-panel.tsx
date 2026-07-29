"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"
import { Settings2, Save, ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { appAlert } from "@/lib/app-message"

type AdjState = {
  excludeCash: boolean
  excludeCard: boolean
  excludeQr: boolean
  excludeDeliveryApp: boolean
  excludeOther: boolean
  cashRatio: number
  cardRatio: number
  qrRatio: number
  deliveryRatio: number
  otherRatio: number
}

const DEFAULT_ADJ: AdjState = {
  excludeCash: false,
  excludeCard: false,
  excludeQr: false,
  excludeDeliveryApp: false,
  excludeOther: false,
  cashRatio: 1,
  cardRatio: 1,
  qrRatio: 1,
  deliveryRatio: 1,
  otherRatio: 1,
}

type ChannelTotals = {
  cash: number
  card: number
  qr: number
  deliveryApp: number
  other: number
  total: number
  count: number
}

type DailySalesRow = ChannelTotals & { date: string }

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pctLabel(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

function clampRatio(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function splitVatInclusive(gross: number): { net: number; vat: number } {
  if (gross <= 0) return { net: 0, vat: 0 }
  const net = Math.round((gross * 100) / 107 * 100) / 100
  const vat = Math.round((gross - net) * 100) / 100
  return { net, vat }
}

function applyAdj(ch: ChannelTotals, adj: AdjState): { adjusted: ChannelTotals; net: number; vat: number } {
  const cashR = adj.excludeCash ? 0 : clampRatio(adj.cashRatio)
  const cardR = adj.excludeCard ? 0 : clampRatio(adj.cardRatio)
  const qrR = adj.excludeQr ? 0 : clampRatio(adj.qrRatio)
  const delR = adj.excludeDeliveryApp ? 0 : clampRatio(adj.deliveryRatio)
  const othR = adj.excludeOther ? 0 : clampRatio(adj.otherRatio)
  const cash = Math.round(ch.cash * cashR * 100) / 100
  const card = Math.round(ch.card * cardR * 100) / 100
  const qr = Math.round(ch.qr * qrR * 100) / 100
  const deliveryApp = Math.round(ch.deliveryApp * delR * 100) / 100
  const other = Math.round(ch.other * othR * 100) / 100
  const total = Math.round((cash + card + qr + deliveryApp + other) * 100) / 100
  const sv = splitVatInclusive(total)
  return { adjusted: { cash, card, qr, deliveryApp, other, total, count: ch.count }, ...sv }
}

export type Pp30AdjustedOutput = {
  adjustedTotal: number
  adjustedNet: number
  adjustedVat: number
}

export type Pp30SalesAdjustmentPanelProps = {
  t: (key: string) => string
  taxMonth: string
  storeName: string
  pp30Queried: boolean
  onAdjustmentResult?: (result: Pp30AdjustedOutput | null) => void
}

export function Pp30SalesAdjustmentPanel({
  t,
  taxMonth,
  storeName,
  pp30Queried,
  onAdjustmentResult,
}: Pp30SalesAdjustmentPanelProps) {
  const [open, setOpen] = React.useState(false)
  const [adj, setAdj] = React.useState<AdjState>(DEFAULT_ADJ)
  const [saving, setSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [channelData, setChannelData] = React.useState<{ totals: ChannelTotals; daily: DailySalesRow[] } | null>(null)
  const [showDaily, setShowDaily] = React.useState(false)

  React.useEffect(() => {
    if (!taxMonth || !storeName || !pp30Queried) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [salesRes, adjRes] = await Promise.all([
          apiFetch(`/api/getPp30ChannelSales?taxMonth=${encodeURIComponent(taxMonth)}&store=${encodeURIComponent(storeName)}`),
          apiFetch(`/api/getPp30SalesAdjustment?taxMonth=${encodeURIComponent(taxMonth)}`),
        ])
        const salesData = await salesRes.json()
        const adjData = await adjRes.json()
        if (cancelled) return

        if (salesData?.success) {
          setChannelData({
            totals: salesData.totals ?? { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0, count: 0 },
            daily: salesData.dailySales ?? [],
          })
        }

        const rows = (adjData?.adjustments ?? []) as Array<Record<string, unknown>>
        const match = rows.find((r: Record<string, unknown>) => String(r.store_name || '') === storeName)
        if (match) {
          setAdj({
            excludeCash: !!match.exclude_cash,
            excludeCard: !!match.exclude_card,
            excludeQr: !!match.exclude_qr,
            excludeDeliveryApp: !!match.exclude_delivery_app,
            excludeOther: !!match.exclude_other,
            cashRatio: Number(match.cash_ratio ?? 1),
            cardRatio: Number(match.card_ratio ?? 1),
            qrRatio: Number(match.qr_ratio ?? 1),
            deliveryRatio: Number(match.delivery_ratio ?? 1),
            otherRatio: Number(match.other_ratio ?? 1),
          })
          setOpen(true)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [taxMonth, storeName, pp30Queried])

  const hasAnyAdjustment = adj.excludeCash || adj.excludeCard || adj.excludeQr || adj.excludeDeliveryApp || adj.excludeOther ||
    adj.cashRatio < 1 || adj.cardRatio < 1 || adj.qrRatio < 1 || adj.deliveryRatio < 1 || adj.otherRatio < 1

  const result = React.useMemo(() => {
    if (!channelData) return null
    return applyAdj(channelData.totals, adj)
  }, [channelData, adj])

  const dailyResults = React.useMemo(() => {
    if (!channelData?.daily?.length) return []
    return channelData.daily.map((d) => {
      const r = applyAdj(d, adj)
      return { date: d.date, originalTotal: d.total, adjustedTotal: r.adjusted.total, adjustedNet: r.net, adjustedVat: r.vat }
    })
  }, [channelData, adj])

  React.useEffect(() => {
    if (!result || !hasAnyAdjustment) {
      onAdjustmentResult?.(null)
      return
    }
    onAdjustmentResult?.({
      adjustedTotal: result.adjusted.total,
      adjustedNet: result.net,
      adjustedVat: result.vat,
    })
  }, [result, hasAnyAdjustment, onAdjustmentResult])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/savePp30SalesAdjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName,
          taxMonth,
          excludeCash: adj.excludeCash,
          excludeCard: adj.excludeCard,
          excludeQr: adj.excludeQr,
          excludeDeliveryApp: adj.excludeDeliveryApp,
          excludeOther: adj.excludeOther,
          cashRatio: adj.cashRatio,
          cardRatio: adj.cardRatio,
          qrRatio: adj.qrRatio,
          deliveryRatio: adj.deliveryRatio,
          otherRatio: adj.otherRatio,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "SAVE_FAILED")
      appAlert("저장 완료")
    } catch (err) {
      appAlert(`저장 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`)
    } finally {
      setSaving(false)
    }
  }

  if (!pp30Queried || loading) {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 채널별 매출 로드 중…
        </div>
      )
    }
    return null
  }

  if (!channelData || channelData.totals.total <= 0) return null

  type ChannelDef = {
    key: keyof Pick<AdjState, "excludeCash" | "excludeCard" | "excludeQr" | "excludeDeliveryApp" | "excludeOther">
    ratioKey: keyof Pick<AdjState, "cashRatio" | "cardRatio" | "qrRatio" | "deliveryRatio" | "otherRatio">
    label: string
    originalAmt: number
    adjustedAmt: number
  }

  const channels: ChannelDef[] = [
    { key: "excludeCash", ratioKey: "cashRatio", label: "현금", originalAmt: channelData.totals.cash, adjustedAmt: result?.adjusted.cash ?? 0 },
    { key: "excludeCard", ratioKey: "cardRatio", label: "카드", originalAmt: channelData.totals.card, adjustedAmt: result?.adjusted.card ?? 0 },
    { key: "excludeQr", ratioKey: "qrRatio", label: "QR", originalAmt: channelData.totals.qr, adjustedAmt: result?.adjusted.qr ?? 0 },
    { key: "excludeDeliveryApp", ratioKey: "deliveryRatio", label: "배달앱", originalAmt: channelData.totals.deliveryApp, adjustedAmt: result?.adjusted.deliveryApp ?? 0 },
    { key: "excludeOther", ratioKey: "otherRatio", label: "기타", originalAmt: channelData.totals.other, adjustedAmt: result?.adjusted.other ?? 0 },
  ]

  return (
    <Card className="border-dashed border-amber-300 bg-amber-50/30">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => setOpen(!open)}
      >
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4 text-amber-600" />
          <span>PP30 매출 조정</span>
          {hasAnyAdjustment && (
            <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
              조정 중
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </CardTitle>
        {!open && hasAnyAdjustment && result && (
          <div className="text-xs text-amber-700 mt-1">
            원본 {fmtNum(channelData.totals.total)} → 조정 {fmtNum(result.adjusted.total)}
            {" "}({channelData.totals.total > 0 ? `-${Math.round((1 - result.adjusted.total / channelData.totals.total) * 100)}%` : ""})
          </div>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-3">
            {channels.map((ch) => {
              const excluded = adj[ch.key]
              const ratio = adj[ch.ratioKey]
              if (ch.originalAmt <= 0 && !excluded) return null
              return (
                <div key={ch.key} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={!excluded}
                      onCheckedChange={(checked: boolean) =>
                        setAdj((prev) => ({ ...prev, [ch.key]: !checked }))
                      }
                    />
                    <Label className="text-sm min-w-[50px]">{ch.label}</Label>
                    <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                      {fmtNum(ch.originalAmt)}
                    </span>
                    {!excluded && ch.originalAmt > 0 && ratio < 1 && (
                      <span className="text-xs font-medium tabular-nums text-amber-700">
                        → {fmtNum(ch.adjustedAmt)}
                      </span>
                    )}
                    {excluded && (
                      <span className="text-xs text-red-500 font-medium">제외</span>
                    )}
                  </div>
                  {!excluded && ch.originalAmt > 0 && (
                    <div className="flex items-center gap-2 pl-8">
                      <span className="text-[11px] text-muted-foreground w-8 text-right">{pctLabel(ratio)}</span>
                      <Input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(ratio * 100)}
                        onChange={(e) =>
                          setAdj((prev) => ({ ...prev, [ch.ratioKey]: Number(e.target.value) / 100 }))
                        }
                        className="flex-1 h-5 p-0 border-0 accent-amber-600"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {result && (
            <div className="rounded-md bg-white/70 border p-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">원본 매출 ({channelData.totals.count}건)</span>
                <span className="tabular-nums font-medium">{fmtNum(channelData.totals.total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-amber-700 font-medium">조정 후 매출 (VAT 포함)</span>
                <span className="tabular-nums font-bold text-amber-700">{fmtNum(result.adjusted.total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">조정 후 공급가액</span>
                <span className="tabular-nums">{fmtNum(result.net)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">조정 후 매출세액 (VAT 7%)</span>
                <span className="tabular-nums">{fmtNum(result.vat)}</span>
              </div>
              {channelData.totals.total > 0 && hasAnyAdjustment && (
                <div className="flex justify-between text-xs pt-1 border-t">
                  <span className="text-muted-foreground">감소율</span>
                  <span className="tabular-nums text-red-600 font-medium">
                    -{Math.round((1 - result.adjusted.total / channelData.totals.total) * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {dailyResults.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowDaily(!showDaily)}
              >
                {showDaily ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                일별 배분 ({dailyResults.length}일)
              </button>
              {showDaily && (
                <div className="mt-2 max-h-[300px] overflow-y-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80">
                      <tr>
                        <th className="text-left p-1.5 font-medium">날짜</th>
                        <th className="text-right p-1.5 font-medium">원본</th>
                        <th className="text-right p-1.5 font-medium text-amber-700">조정</th>
                        <th className="text-right p-1.5 font-medium">공급가</th>
                        <th className="text-right p-1.5 font-medium">VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyResults.map((d) => (
                        <tr key={d.date} className="border-t">
                          <td className="p-1.5 tabular-nums">{d.date}</td>
                          <td className="p-1.5 text-right tabular-nums">{fmtNum(d.originalTotal)}</td>
                          <td className={cn(
                            "p-1.5 text-right tabular-nums font-medium",
                            d.adjustedTotal < d.originalTotal && "text-amber-700"
                          )}>
                            {fmtNum(d.adjustedTotal)}
                          </td>
                          <td className="p-1.5 text-right tabular-nums">{fmtNum(d.adjustedNet)}</td>
                          <td className="p-1.5 text-right tabular-nums">{fmtNum(d.adjustedVat)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "저장 중..." : "조정 저장"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
