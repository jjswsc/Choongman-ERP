"use client"

import * as React from "react"
import { Wallet, Save, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosSettlement,
  savePosSettlement,
  useStoreList,
  type PosSettlement,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"

export default function PosSettlementPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [settleDate, setSettleDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [storeFilter, setStoreFilter] = React.useState("")
  const [systemTotal, setSystemTotal] = React.useState(0)
  const [settlement, setSettlement] = React.useState<PosSettlement | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [systemSubtotal, setSystemSubtotal] = React.useState(0)
  const [systemVat, setSystemVat] = React.useState(0)

  const [cashActual, setCashActual] = React.useState<string>("")
  const [cardAmt, setCardAmt] = React.useState<string>("")
  const [qrAmt, setQrAmt] = React.useState<string>("")
  const [deliveryAppAmt, setDeliveryAppAmt] = React.useState<string>("")
  const [otherAmt, setOtherAmt] = React.useState<string>("")
  const [memo, setMemo] = React.useState("")
  const [closed, setClosed] = React.useState(false)

  const canSearchAll = isOfficeRole(auth?.role || "")
  const effectiveStore = canSearchAll && storeFilter ? storeFilter : auth?.store || ""

  const loadData = React.useCallback(() => {
    if (!effectiveStore) return
    setLoading(true)
    getPosSettlement({
      settleDate,
      storeCode: effectiveStore,
    })
      .then(({ systemTotal: st, systemSubtotal: sub, systemVat: vat, settlement: s }) => {
        setSystemTotal(st)
        setSystemSubtotal(sub ?? st)
        setSystemVat(vat ?? 0)
        const single = Array.isArray(s) ? s[0] : s
        if (single) {
          setSettlement(single)
          setCashActual(single.cashActual != null ? String(single.cashActual) : "")
          setCardAmt(String(single.cardAmt ?? 0))
          setQrAmt(String(single.qrAmt ?? 0))
          setDeliveryAppAmt(String(single.deliveryAppAmt ?? 0))
          setOtherAmt(String(single.otherAmt ?? 0))
          setMemo(single.memo ?? "")
          setClosed(single.closed ?? false)
        } else {
          setSettlement(null)
          setSystemSubtotal(0)
          setSystemVat(0)
          setCashActual("")
          setCardAmt("0")
          setQrAmt("0")
          setDeliveryAppAmt("0")
          setOtherAmt("0")
          setMemo("")
          setClosed(false)
        }
      })
      .catch(() => {
        setSystemTotal(0)
        setSystemSubtotal(0)
        setSystemVat(0)
        setSettlement(null)
      })
      .finally(() => setLoading(false))
  }, [settleDate, effectiveStore])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeFilter) {
      setStoreFilter(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreFilter(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeFilter])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const cashActualNum = parseFloat(cashActual) || 0
  const cardNum = parseFloat(cardAmt) || 0
  const qrNum = parseFloat(qrAmt) || 0
  const deliveryNum = parseFloat(deliveryAppAmt) || 0
  const otherNum = parseFloat(otherAmt) || 0
  const totalInput = cashActualNum + cardNum + qrNum + deliveryNum + otherNum
  const diff = totalInput - systemTotal

  const handleSave = async () => {
    if (!effectiveStore) {
      alert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosSettlement({
        storeCode: effectiveStore,
        settleDate,
        cashActual: cashActual ? cashActualNum : null,
        cardAmt: cardNum,
        qrAmt: qrNum,
        deliveryAppAmt: deliveryNum,
        otherAmt: otherNum,
        memo,
        closed,
      })
      if (res.success) {
        alert(t("itemsAlertSaved") || "저장되었습니다.")
        loadData()
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posSettlement") || "POS 결산"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posSettlementSub") || "일별 매출·결제수단 입력, 돈통 시제"}
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Input
            type="date"
            value={settleDate}
            onChange={(e) => setSettleDate(e.target.value)}
            className="h-10 w-40"
          />
          {canSearchAll && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-10 w-36">
                <SelectValue placeholder={t("store") || "매장"} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-1.5"
            onClick={loadData}
            disabled={loading}
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {effectiveStore && !loading && (
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <div className="space-y-1.5 rounded-lg bg-muted/30 px-4 py-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("posSystemSubtotal") || "공급가액"}</span>
                <span className="tabular-nums">{systemSubtotal.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("posSystemVat") || "VAT (7%)"}</span>
                <span className="tabular-nums">{systemVat.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="font-medium">{t("posSystemTotal") || "시스템 매출"}</span>
                <span className="text-lg font-bold tabular-nums">
                  {systemTotal.toLocaleString()} ฿
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm">
                <span>{t("posCashActual") || "돈통 시제"}</span>
                <Input
                  type="number"
                  placeholder="실제 현금"
                  className="ml-2 h-9 w-32 text-right"
                  value={cashActual}
                  onChange={(e) => setCashActual(e.target.value)}
                  disabled={closed}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>{t("posCard") || "카드"}</span>
                <Input
                  type="number"
                  className="ml-2 h-9 w-32 text-right"
                  value={cardAmt}
                  onChange={(e) => setCardAmt(e.target.value)}
                  disabled={closed}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>{t("posQr") || "QR/모바일"}</span>
                <Input
                  type="number"
                  className="ml-2 h-9 w-32 text-right"
                  value={qrAmt}
                  onChange={(e) => setQrAmt(e.target.value)}
                  disabled={closed}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>{t("posDeliveryApp") || "배달앱"}</span>
                <Input
                  type="number"
                  className="ml-2 h-9 w-32 text-right"
                  value={deliveryAppAmt}
                  onChange={(e) => setDeliveryAppAmt(e.target.value)}
                  disabled={closed}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>{t("posOther") || "기타"}</span>
                <Input
                  type="number"
                  className="ml-2 h-9 w-32 text-right"
                  value={otherAmt}
                  onChange={(e) => setOtherAmt(e.target.value)}
                  disabled={closed}
                />
              </label>
            </div>

            <div className="space-y-1 rounded-lg border px-4 py-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("posCashActual") || "현금"}</span>
                <span className="tabular-nums">{cashActualNum.toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("posCard") || "카드"} + {t("posQr") || "QR"} + {t("posDeliveryApp") || "배달앱"} + {t("posOther") || "기타"}</span>
                <span className="tabular-nums">{(cardNum + qrNum + deliveryNum + otherNum).toLocaleString()} ฿</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t font-medium">
                <span>{t("posInputTotal") || "입력 합계"}</span>
                <span className="font-bold tabular-nums">{totalInput.toLocaleString()} ฿</span>
              </div>
            </div>

            <div
              className={`flex justify-between items-center rounded-lg px-4 py-3 ${
                diff === 0 ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"
              }`}
            >
              <span className="font-medium">{t("posDifference") || "차액"} ({t("posDifferenceHint") || "입력−시스템"})</span>
              <span className="font-bold tabular-nums">
                {diff >= 0 ? "+" : ""}
                {diff.toLocaleString()} ฿
              </span>
            </div>

            <div>
              <label className="text-sm">{t("posMemo") || "비고"}</label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={t("posMemoPh") || "메모"}
                className="mt-1"
                disabled={closed}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={closed}
                onChange={(e) => setClosed(e.target.checked)}
              />
              {t("posClosed") || "마감"}
            </label>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || closed}
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "..." : t("itemsBtnSave") || "저장"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
