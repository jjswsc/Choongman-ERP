"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { tOr, useT } from "@/lib/i18n"
import { getBorrowingLedger, type BorrowingLedgerLine, type BorrowingPartyBalance } from "@/lib/api-client"
import { formatBahtInteger as formatBaht } from "@/lib/financial-amount-format"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { AccountingEmptyState } from "@/components/admin/accounting-result-primitives"

export function BorrowingsLedgerPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const today = getBangkokTodayDateString()
  const [endStr, setEndStr] = React.useState(today)
  const [startStr, setStartStr] = React.useState(`${today.slice(0, 8)}01`)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [byParty, setByParty] = React.useState<BorrowingPartyBalance[]>([])
  const [lines, setLines] = React.useState<BorrowingLedgerLine[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getBorrowingLedger({ endStr, startStr })
      setByParty(data.byParty)
      setLines(data.lines)
    } catch (e) {
      setByParty([])
      setLines([])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [endStr, startStr])

  React.useEffect(() => {
    void load()
  }, [load])

  const total = byParty.reduce((s, r) => s + (Number(r.balance) || 0), 0)
  const partyNameByCode = React.useMemo(
    () => new Map(byParty.map((p) => [p.partyCode, p.partyName])),
    [byParty]
  )

  const refTypeLabel = React.useCallback(
    (refType: string) => {
      const r = String(refType || "").trim().toLowerCase()
      if (r === "borrow") return tOr(t, "borrowRefBorrow", "차입 수령")
      if (r === "repay") return tOr(t, "borrowRefRepay", "상환")
      if (r === "opening") return tOr(t, "borrowRefOpening", "기초")
      return refType || "—"
    },
    [t]
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {tOr(
          t,
          "wm_loan_not_receivable_hint",
          "임원 차입은 가맹 미수금이 아닙니다. 잔액 합계는 재무상태표 차입금(2150)과 같아야 합니다."
        )}
      </p>
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">{tOr(t, "dateFrom", "시작일")}</label>
              <Input type="date" className="h-9 w-[150px]" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">{tOr(t, "dateTo", "종료일")}</label>
              <Input type="date" className="h-9 w-[150px]" value={endStr} onChange={(e) => setEndStr(e.target.value)} />
            </div>
            <Button type="button" className="h-9" onClick={() => void load()} disabled={loading}>
              <Search className="h-4 w-4 mr-1" />
              {tOr(t, "search", "검색")}
            </Button>
          </div>
          {loading ? (
            <AccountingEmptyState>{tOr(t, "loading", "불러오는 중...")}</AccountingEmptyState>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{tOr(t, "bs_borrowings", "차입금")}</span>
                <span className="font-mono tabular-nums font-semibold">{formatBaht(total)}</span>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-2">{tOr(t, "wm_loan_party", "관련당사자")}</th>
                      <th className="text-right p-2">{tOr(t, "ledgerPairOpenRemain", "잔액")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byParty.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="p-3 text-muted-foreground">
                          {tOr(t, "inNoData", "조회된 내역이 없습니다.")}
                        </td>
                      </tr>
                    ) : (
                      byParty.map((r) => (
                        <tr key={r.partyCode} className="border-b">
                          <td className="p-2">
                            {r.partyName} ({r.partyCode})
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums">{formatBaht(r.balance)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-2">{tOr(t, "date", "날짜")}</th>
                      <th className="text-left p-2">{tOr(t, "wm_loan_party", "관련당사자")}</th>
                      <th className="text-left p-2">{tOr(t, "type", "구분")}</th>
                      <th className="text-right p-2">{tOr(t, "amount", "금액")}</th>
                      <th className="text-left p-2">{tOr(t, "memo", "메모")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-muted-foreground">
                          {tOr(t, "inNoData", "조회된 내역이 없습니다.")}
                        </td>
                      </tr>
                    ) : (
                      lines.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="p-2 whitespace-nowrap">{r.transDate}</td>
                          <td className="p-2">
                            {partyNameByCode.get(r.partyCode)
                              ? `${partyNameByCode.get(r.partyCode)} (${r.partyCode})`
                              : r.partyCode}
                          </td>
                          <td className="p-2">{refTypeLabel(r.refType)}</td>
                          <td className="p-2 text-right font-mono tabular-nums">{formatBaht(r.amount)}</td>
                          <td className="p-2 text-muted-foreground">{r.memo || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
