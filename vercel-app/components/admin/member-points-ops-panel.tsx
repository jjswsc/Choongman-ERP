"use client"

import { appAlert } from "@/lib/app-message"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adjustMemberPoints, getMemberTiers, type Member } from "@/lib/api-client"
import { apiFetch } from "@/lib/api/fetch"
import { formatBahtInputDisplay, parseBahtAmount } from "@/lib/baht-input-format"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { formatMemberPointsDisplay, roundMemberPointsEarn } from "@/lib/member-points-math"
import { formatTierRatePercentInput } from "@/lib/member-tier-rate-percent"

type LedgerRow = {
  id: number
  memberId: number
  kind: string
  points: number
  amount: number
  note: string
  createdAt: string
}

type TierRateRow = {
  code: string
  point_rate: number
}

function formatPointKind(kind: string, t: ReturnType<typeof useT>): string {
  if (kind === "earn") return t("memberPointsKindEarn")
  if (kind === "use") return t("memberPointsKindUse")
  if (kind === "adjust") return t("memberPointsKindAdjust")
  return kind
}

function resolveTierPointRate(tiers: TierRateRow[], tierCode?: string | null): number {
  if (!tiers.length) return 0
  const code = String(tierCode || "BRONZE").trim().toUpperCase()
  const row = tiers.find((x) => String(x.code || "").trim().toUpperCase() === code)
  const rate = Number(row?.point_rate)
  return Number.isFinite(rate) && rate >= 0 ? rate : 0
}

type Props = {
  member: Member
  onMemberPointsChange?: (member: Member) => void
}

/** 선택 회원에 대한 잔액·수기 조정·원장 (회원 관리 화면 공통) */
export function MemberPointsOpsPanel({ member, onMemberPointsChange }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [selectedMember, setSelectedMember] = React.useState<Member>(member)
  const [deltaPoints, setDeltaPoints] = React.useState("0")
  const [spendAmount, setSpendAmount] = React.useState("")
  const [note, setNote] = React.useState("")
  const [tiers, setTiers] = React.useState<TierRateRow[]>([])
  const [rows, setRows] = React.useState<LedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = React.useState(false)
  const [adjusting, setAdjusting] = React.useState(false)
  const [ledgerFrom, setLedgerFrom] = React.useState("")
  const [ledgerTo, setLedgerTo] = React.useState("")
  const [ledgerOffset, setLedgerOffset] = React.useState(0)
  const [ledgerLoaded, setLedgerLoaded] = React.useState(false)
  const LEDGER_PAGE = 100

  React.useEffect(() => {
    setSelectedMember(member)
    setDeltaPoints("0")
    setSpendAmount("")
    setNote("")
    setRows([])
    setLedgerLoaded(false)
    setLedgerOffset(0)
  }, [member.id])

  const loadLedger = React.useCallback(
    async (memberId: number, offset = 0) => {
      setLedgerLoading(true)
      try {
        const q = new URLSearchParams({
          memberId: String(memberId),
          limit: String(LEDGER_PAGE),
          offset: String(offset),
        })
        if (ledgerFrom) q.set("startStr", ledgerFrom)
        if (ledgerTo) q.set("endStr", ledgerTo)
        const res = await apiFetch(`/api/member-points?${q}`)
        const points = (await res.json()) as LedgerRow[]
        setRows(Array.isArray(points) ? points : [])
        setLedgerOffset(offset)
        setLedgerLoaded(true)
      } catch {
        setRows([])
      } finally {
        setLedgerLoading(false)
      }
    },
    [ledgerFrom, ledgerTo]
  )

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await getMemberTiers()
        if (cancelled) return
        setTiers(
          (list || []).map((row) => ({
            code: String(row.code || ""),
            point_rate: Number(row.point_rate || 0),
          }))
        )
      } catch {
        if (!cancelled) setTiers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const tierPointRate = React.useMemo(
    () => resolveTierPointRate(tiers, selectedMember?.tierCode),
    [tiers, selectedMember?.tierCode]
  )

  const spendParsed = parseBahtAmount(spendAmount)
  const previewPoints = spendParsed > 0 ? roundMemberPointsEarn(spendParsed * tierPointRate) : 0

  const applySpendCalc = React.useCallback(() => {
    if (previewPoints <= 0) return
    setDeltaPoints(String(previewPoints))
    if (!note.trim()) {
      setNote(
        tr(t, "memberPointsRetroNote", {
          amount: spendParsed.toLocaleString("en-US"),
          tier: selectedMember?.tierCode || "BRONZE",
          rate: formatTierRatePercentInput(tierPointRate),
          points: formatMemberPointsDisplay(previewPoints),
        })
      )
    }
  }, [previewPoints, note, t, spendParsed, selectedMember?.tierCode, tierPointRate])

  const pushMember = (next: Member) => {
    setSelectedMember(next)
    onMemberPointsChange?.(next)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("memberPointsBalanceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">{t("name")}</p>
            <p className="font-medium">{selectedMember.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("memberNo")}</p>
            <p className="font-medium">{selectedMember.memberNo || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("memberTier")}</p>
            <p className="font-medium">{selectedMember.tierCode || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("memberPointsBalance")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {Number(selectedMember.pointBalance || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("memberPointsTierCumulative")}</p>
            <p className="text-lg font-semibold tabular-nums">
              {Number(selectedMember.tierPoints || 0).toLocaleString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("memberPointsAdjustTitle")}</CardTitle>
          <p className="text-xs text-muted-foreground">{t("memberPointsCalcHint")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-1">
                <Label className="text-xs">{t("memberPointsSpendAmount")}</Label>
                <Input
                  inputMode="decimal"
                  placeholder={t("memberPointsSpendAmountPh")}
                  value={spendAmount}
                  onChange={(e) => setSpendAmount(formatBahtInputDisplay(e.target.value))}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={previewPoints <= 0}
                onClick={applySpendCalc}
              >
                {t("memberPointsCalcFromSpend")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {spendParsed > 0
                ? tr(t, "memberPointsCalcPreview", {
                    tier: selectedMember.tierCode || "BRONZE",
                    rate: formatTierRatePercentInput(tierPointRate),
                    points: formatMemberPointsDisplay(previewPoints),
                  })
                : t("memberPointsCalcPreviewIdle")}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label className="text-xs">{t("points")}</Label>
                <Input
                  placeholder={t("memberPointsDeltaPh")}
                  value={deltaPoints}
                  onChange={(e) => setDeltaPoints(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">{t("reason")}</Label>
                <Input placeholder={t("reason")} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
            <Button
              className="shrink-0 sm:min-w-[5.5rem]"
              disabled={adjusting}
              onClick={async () => {
                const p = Number(deltaPoints || 0)
                if (!selectedMember.id || !p) return
                const amountForLedger = spendParsed > 0 && p > 0 ? spendParsed : 0
                setAdjusting(true)
                try {
                  const res = await adjustMemberPoints({
                    memberId: selectedMember.id,
                    points: p,
                    note,
                    amount: amountForLedger || undefined,
                  })
                  if (!res.success) {
                    await appAlert(res.message || t("memberPointsAdjustFail"))
                    return
                  }
                  setDeltaPoints("0")
                  setSpendAmount("")
                  setNote("")
                  const next: Member = {
                    ...selectedMember,
                    pointBalance: Number(selectedMember.pointBalance || 0) + p,
                    tierPoints:
                      p > 0
                        ? Number(selectedMember.tierPoints || 0) + p
                        : Number(selectedMember.tierPoints || 0),
                  }
                  pushMember(next)
                  await loadLedger(selectedMember.id, ledgerOffset)
                } finally {
                  setAdjusting(false)
                }
              }}
            >
              {adjusting ? t("loading") : t("apply")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberPointsLedgerTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <p className="text-xs text-muted-foreground">{t("crmPointsLedgerFrom")}</p>
              <Input
                type="date"
                value={ledgerFrom}
                onChange={(e) => setLedgerFrom(e.target.value)}
                className="h-9 w-[140px]"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("crmPointsLedgerTo")}</p>
              <Input
                type="date"
                value={ledgerTo}
                onChange={(e) => setLedgerTo(e.target.value)}
                className="h-9 w-[140px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedMember?.id || ledgerLoading}
              onClick={() => selectedMember?.id && loadLedger(selectedMember.id, 0)}
            >
              {ledgerLoading ? t("loading") : t("crmPointsLedgerFilter")}
            </Button>
          </div>
          {!ledgerLoaded && !ledgerLoading ? (
            <p className="text-xs text-muted-foreground">{t("memberPointsLedgerLoadHint")}</p>
          ) : null}
          {ledgerLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">{t("date")}</th>
                    <th className="p-2 text-left">{t("type")}</th>
                    <th className="p-2 text-right">{t("points")}</th>
                    <th className="p-2 text-right">{t("amount")}</th>
                    <th className="p-2 text-left">{t("memo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 whitespace-nowrap">{r.createdAt}</td>
                      <td className="p-2">{formatPointKind(r.kind, t)}</td>
                      <td
                        className={`p-2 text-right tabular-nums ${r.points >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}
                      >
                        {r.points >= 0 ? "+" : ""}
                        {r.points.toLocaleString()}
                      </td>
                      <td className="p-2 text-right tabular-nums">{Number(r.amount || 0).toLocaleString()}</td>
                      <td className="p-2">{r.note || "—"}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        {t("memberPointsNoLedger")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={ledgerOffset <= 0 || !selectedMember?.id}
              onClick={() =>
                selectedMember?.id && loadLedger(selectedMember.id, Math.max(0, ledgerOffset - LEDGER_PAGE))
              }
            >
              {t("memberListPagePrev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length < LEDGER_PAGE || !selectedMember?.id}
              onClick={() => selectedMember?.id && loadLedger(selectedMember.id, ledgerOffset + LEDGER_PAGE)}
            >
              {t("memberListPageNext")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
