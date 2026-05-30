"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { apiFetch } from "@/lib/api/fetch"
import { getMemberVisits } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type VisitRow = {
  orderId: number
  memberId: number
  memberNo: string
  storeCode: string
  orderNo: string
  total: number
  visitedAt: string
}

type MemberVisitAnalysisRow = {
  memberId: number
  memberNo: string
  visitCount: number
  avgVisitCycleDays: number | null
  avgTicketAmount: number
  totalContribution: number
  lastVisitedAt: string
}

type RfmRow = {
  memberId: number
  recencyDays: number
  frequencyCount: number
  monetaryAmount: number
  rScore: number
  fScore: number
  mScore: number
  rfmScore: string
}

function parseDateSafe(value: string): Date | null {
  const raw = String(value || "").trim()
  if (!raw) return null
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"))
  if (Number.isNaN(d.getTime())) return null
  return d
}

function calcAvgVisitCycleDays(rows: VisitRow[]): number | null {
  if (rows.length < 2) return null
  const sorted = [...rows]
    .map((x) => ({ ...x, d: parseDateSafe(x.visitedAt) }))
    .filter((x) => x.d != null)
    .sort((a, b) => (b.d!.getTime() - a.d!.getTime()))
  if (sorted.length < 2) return null
  let totalDays = 0
  let gaps = 0
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i].d!
    const next = sorted[i + 1].d!
    const diffMs = Math.max(0, current.getTime() - next.getTime())
    totalDays += diffMs / (1000 * 60 * 60 * 24)
    gaps += 1
  }
  if (gaps <= 0) return null
  return Number((totalDays / gaps).toFixed(1))
}

function buildMemberVisitAnalysis(rows: VisitRow[]): MemberVisitAnalysisRow[] {
  const byMember = new Map<number, VisitRow[]>()
  for (const row of rows) {
    const memberId = Number(row.memberId || 0)
    if (!memberId) continue
    const list = byMember.get(memberId) || []
    list.push(row)
    byMember.set(memberId, list)
  }
  const out: MemberVisitAnalysisRow[] = []
  for (const [memberId, list] of byMember.entries()) {
    const visitCount = list.length
    const totalContribution = list.reduce((sum, x) => sum + Number(x.total || 0), 0)
    const avgTicketAmount = visitCount > 0 ? totalContribution / visitCount : 0
    const avgVisitCycleDays = calcAvgVisitCycleDays(list)
    const lastVisitedAt = [...list]
      .sort((a, b) => String(b.visitedAt || "").localeCompare(String(a.visitedAt || "")))[0]?.visitedAt || ""
    out.push({
      memberId,
      memberNo: String(list[0]?.memberNo || ""),
      visitCount,
      avgVisitCycleDays,
      avgTicketAmount,
      totalContribution,
      lastVisitedAt,
    })
  }
  return out.sort((a, b) => b.totalContribution - a.totalContribution)
}

export default function MemberVisitsPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const [tab, setTab] = React.useState<"history" | "analysis" | "rfm">("history")
  const [memberId, setMemberId] = React.useState("")
  const [rows, setRows] = React.useState<VisitRow[]>([])
  const [rfmRows, setRfmRows] = React.useState<RfmRow[]>([])
  const [rfmLoading, setRfmLoading] = React.useState(false)
  const analysisRows = React.useMemo(() => buildMemberVisitAnalysis(rows), [rows])
  const kpi = React.useMemo(() => {
    const memberCount = analysisRows.length
    const totalContribution = analysisRows.reduce((sum, row) => sum + Number(row.totalContribution || 0), 0)
    const totalVisits = analysisRows.reduce((sum, row) => sum + Number(row.visitCount || 0), 0)
    const avgTicketAmount = totalVisits > 0 ? totalContribution / totalVisits : 0
    const cycleRows = analysisRows.filter((x) => x.avgVisitCycleDays != null)
    const avgVisitCycleDays =
      cycleRows.length > 0
        ? cycleRows.reduce((sum, x) => sum + Number(x.avgVisitCycleDays || 0), 0) / cycleRows.length
        : null
    const topContributor = analysisRows[0] || null
    return { memberCount, totalContribution, avgTicketAmount, avgVisitCycleDays, topContributor }
  }, [analysisRows])

  const load = React.useCallback(async () => {
    const id = Number(memberId || 0)
    const list = await getMemberVisits({ memberId: id || undefined, limit: 500 })
    setRows(list)
  }, [memberId])

  const loadRfm = React.useCallback(async () => {
    setRfmLoading(true)
    try {
      const res = await apiFetch("/api/crm/rfm?limit=500", { cache: "no-store" })
      if (!res.ok) {
        setRfmRows([])
        return
      }
      const data = (await res.json()) as { success: boolean; rows?: RfmRow[] }
      setRfmRows(data.rows || [])
    } finally {
      setRfmLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  React.useEffect(() => {
    if (searchParams.get("tab") === "rfm") setTab("rfm")
  }, [searchParams])

  React.useEffect(() => {
    if (tab === "rfm") loadRfm().catch(() => {})
  }, [loadRfm, tab])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <CrmSubnav />
        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberVisitsSearchTitle")}</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder={t("memberVisitsMemberIdPh")} value={memberId} onChange={(e) => setMemberId(e.target.value)} />
            <Button variant="outline" onClick={() => load()}>{t("btn_query")}</Button>
          </CardContent>
        </Card>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">{t("memberVisitsKpiMembers")}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{kpi.memberCount.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">{t("memberVisitsAvgTicketAmount")}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{Number(kpi.avgTicketAmount || 0).toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">{t("memberVisitsAvgVisitCycleDays")}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {kpi.avgVisitCycleDays == null ? "-" : `${kpi.avgVisitCycleDays.toFixed(1)} ${t("days")}`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">{t("memberVisitsTotalContribution")}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-semibold">{Number(kpi.totalContribution || 0).toLocaleString()}</p></CardContent>
          </Card>
        </div>

        {kpi.topContributor && (
          <Card className="mb-4">
            <CardHeader><CardTitle className="text-sm">{t("memberVisitsTopContributor")}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              memberId {kpi.topContributor.memberId} ({kpi.topContributor.memberNo || "-"}) ·
              {` ${t("memberVisitsVisitCount")} ${kpi.topContributor.visitCount.toLocaleString()} / ${t("memberVisitsTotalContribution")} ${Number(kpi.topContributor.totalContribution || 0).toLocaleString()}`}
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "history" | "analysis" | "rfm")} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">방문 기록</TabsTrigger>
            <TabsTrigger value="analysis">방문 분석</TabsTrigger>
            <TabsTrigger value="rfm">RFM 점수</TabsTrigger>
          </TabsList>

          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle>{t("memberVisitsHistoryTitle")}</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">{t("posOrderDateTime")}</th>
                        <th className="p-2 text-left">{t("memberId")}</th>
                        <th className="p-2 text-left">{t("memberNo")}</th>
                        <th className="p-2 text-left">{t("store")}</th>
                        <th className="p-2 text-left">{t("posOrderNo")}</th>
                        <th className="p-2 text-left">{t("memberVisitsPaymentAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.orderId} className="border-t">
                          <td className="p-2">{r.visitedAt}</td>
                          <td className="p-2">{r.memberId}</td>
                          <td className="p-2">{r.memberNo}</td>
                          <td className="p-2">{r.storeCode}</td>
                          <td className="p-2">{r.orderNo}</td>
                          <td className="p-2">{Number(r.total || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis">
            <Card>
              <CardHeader><CardTitle>{t("memberVisitsAnalysisTitle")}</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">{t("memberId")}</th>
                        <th className="p-2 text-left">{t("memberNo")}</th>
                        <th className="p-2 text-left">{t("memberVisitsVisitCount")}</th>
                        <th className="p-2 text-left">{t("memberVisitsAvgVisitCycleDays")}</th>
                        <th className="p-2 text-left">{t("memberVisitsAvgTicketAmount")}</th>
                        <th className="p-2 text-left">{t("memberVisitsTotalContribution")}</th>
                        <th className="p-2 text-left">{t("memberVisitsLastVisitedAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisRows.map((r) => (
                        <tr key={r.memberId} className="border-t">
                          <td className="p-2">{r.memberId}</td>
                          <td className="p-2">{r.memberNo || "-"}</td>
                          <td className="p-2">{r.visitCount.toLocaleString()}</td>
                          <td className="p-2">
                            {r.avgVisitCycleDays == null ? "-" : `${r.avgVisitCycleDays.toLocaleString()} ${t("days")}`}
                          </td>
                          <td className="p-2">{Number(r.avgTicketAmount || 0).toLocaleString()}</td>
                          <td className="p-2">{Number(r.totalContribution || 0).toLocaleString()}</td>
                          <td className="p-2">{r.lastVisitedAt || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rfm">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>RFM 점수</CardTitle>
                <Button variant="outline" onClick={() => loadRfm()} disabled={rfmLoading}>
                  {rfmLoading ? "계산 중..." : "새로고침"}
                </Button>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  R(최근성) / F(방문빈도) / M(구매금액)을 같은 화면에서 함께 보고 고객군을 운영합니다.
                </p>
                <div className="overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">memberId</th>
                        <th className="p-2 text-left">Recency(day)</th>
                        <th className="p-2 text-left">Frequency</th>
                        <th className="p-2 text-left">Monetary</th>
                        <th className="p-2 text-left">R</th>
                        <th className="p-2 text-left">F</th>
                        <th className="p-2 text-left">M</th>
                        <th className="p-2 text-left">RFM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfmRows.map((r) => (
                        <tr key={r.memberId} className="border-t">
                          <td className="p-2">{r.memberId}</td>
                          <td className="p-2">{r.recencyDays}</td>
                          <td className="p-2">{r.frequencyCount}</td>
                          <td className="p-2">{Number(r.monetaryAmount || 0).toLocaleString()}</td>
                          <td className="p-2">{r.rScore}</td>
                          <td className="p-2">{r.fScore}</td>
                          <td className="p-2">{r.mScore}</td>
                          <td className="p-2 font-semibold">{r.rfmScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
