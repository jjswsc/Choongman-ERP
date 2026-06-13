"use client"

import { appAlert } from "@/lib/app-message"
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Wallet } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { CrmPageHero } from "@/components/crm/crm-shared-ui"
import { MemberPointsPolicyTab } from "@/components/admin/member-points-policy-tab"
import { MemberPointsSearchPanel } from "@/components/admin/member-points-search-panel"
import { adjustMemberPoints, getMembers, type Member } from "@/lib/api-client"
import { apiFetch } from "@/lib/api/fetch"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type LedgerRow = {
  id: number
  memberId: number
  kind: string
  points: number
  amount: number
  note: string
  createdAt: string
}

function formatPointKind(kind: string, t: ReturnType<typeof useT>): string {
  if (kind === "earn") return t("memberPointsKindEarn")
  if (kind === "use") return t("memberPointsKindUse")
  if (kind === "adjust") return t("memberPointsKindAdjust")
  return kind
}

export default function MemberPointsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab") === "policy" ? "policy" : "ledger"
  const [tab, setTab] = React.useState(initialTab)
  const [selectedMember, setSelectedMember] = React.useState<Member | null>(null)
  const [deltaPoints, setDeltaPoints] = React.useState("0")
  const [note, setNote] = React.useState("")
  const [rows, setRows] = React.useState<LedgerRow[]>([])
  const [ledgerLoading, setLedgerLoading] = React.useState(false)
  const [adjusting, setAdjusting] = React.useState(false)
  const [ledgerFrom, setLedgerFrom] = React.useState("")
  const [ledgerTo, setLedgerTo] = React.useState("")
  const [ledgerOffset, setLedgerOffset] = React.useState(0)
  const LEDGER_PAGE = 100

  const loadLedger = React.useCallback(async (memberId: number, offset = 0) => {
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
      setRows(points)
      setLedgerOffset(offset)
    } catch {
      setRows([])
    } finally {
      setLedgerLoading(false)
    }
  }, [ledgerFrom, ledgerTo])

  React.useEffect(() => {
    if (selectedMember?.id) {
      void loadLedger(selectedMember.id, 0)
    } else {
      setRows([])
    }
  }, [selectedMember?.id, loadLedger])

  React.useEffect(() => {
    const memberId = Number(searchParams.get("memberId") || 0)
    if (!memberId) return
    getMembers({ q: String(memberId), limit: 5 })
      .then((list) => {
        const m = list.find((x) => x.id === memberId) || list[0]
        if (m) setSelectedMember(m)
      })
      .catch(() => {})
  }, [searchParams])

  React.useEffect(() => {
    const next = searchParams.get("tab") === "policy" ? "policy" : "ledger"
    setTab(next)
  }, [searchParams])

  const handleSelectMember = React.useCallback((member: Member) => {
    setSelectedMember(member)
    setDeltaPoints("0")
    setNote("")
  }, [])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <CrmPageHero
          icon={Wallet}
          title={t("memberPoints")}
          description={t("memberPointsPageSub")}
          gradient="from-emerald-50 to-teal-50"
          border="border-emerald-200/60"
          iconClass="bg-emerald-500/10 text-emerald-600"
        />
        <CrmSubnav />

        <Tabs value={tab} onValueChange={setTab} className="mt-4 space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="ledger">{t("memberPointsTabLedger")}</TabsTrigger>
            <TabsTrigger value="policy">{t("memberPointsTabPolicy")}</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger" className="mt-0">
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <div className="lg:sticky lg:top-4 lg:self-start">
                <MemberPointsSearchPanel
                  selectedMemberId={selectedMember?.id ?? null}
                  onSelectMember={handleSelectMember}
                />
              </div>

              <div className="space-y-4">
                {selectedMember ? (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("memberPointsSelectedMember")}</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">{t("memberPointsAdjustTitle")}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="grid flex-1 gap-2 sm:grid-cols-2">
                          <Input
                            placeholder={t("memberPointsDeltaPh")}
                            value={deltaPoints}
                            onChange={(e) => setDeltaPoints(e.target.value)}
                          />
                          <Input placeholder={t("reason")} value={note} onChange={(e) => setNote(e.target.value)} />
                        </div>
                        <Button
                          className="shrink-0 sm:min-w-[5.5rem]"
                          disabled={adjusting}
                          onClick={async () => {
                            const p = Number(deltaPoints || 0)
                            if (!selectedMember.id || !p) return
                            setAdjusting(true)
                            try {
                              const res = await adjustMemberPoints({
                                memberId: selectedMember.id,
                                points: p,
                                note,
                              })
                              if (!res.success) {
                                await appAlert(res.message || t("memberPointsAdjustFail"))
                                return
                              }
                              setDeltaPoints("0")
                              setNote("")
                              setSelectedMember((prev) =>
                                prev ? { ...prev, pointBalance: Number(prev.pointBalance || 0) + p } : prev
                              )
                              await loadLedger(selectedMember.id, ledgerOffset)
                            } finally {
                              setAdjusting(false)
                            }
                          }}
                        >
                          {adjusting ? t("loading") : t("apply")}
                        </Button>
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
                            <Input type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} className="h-9 w-[140px]" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t("crmPointsLedgerTo")}</p>
                            <Input type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} className="h-9 w-[140px]" />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!selectedMember?.id}
                            onClick={() => selectedMember?.id && loadLedger(selectedMember.id, 0)}
                          >
                            {t("crmPointsLedgerFilter")}
                          </Button>
                        </div>
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
                                    <td className="p-2 text-right tabular-nums">
                                      {Number(r.amount || 0).toLocaleString()}
                                    </td>
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
                            onClick={() => selectedMember?.id && loadLedger(selectedMember.id, Math.max(0, ledgerOffset - LEDGER_PAGE))}
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
                  </>
                ) : (
                  <Card>
                    <CardContent className="flex min-h-[280px] items-center justify-center p-8">
                      <p className="text-center text-sm text-muted-foreground">{t("memberPointsSelectHint")}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="policy" className="mt-0">
            <MemberPointsPolicyTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
