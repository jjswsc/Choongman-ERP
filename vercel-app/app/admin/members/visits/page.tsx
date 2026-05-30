"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CrmSubnav } from "@/components/erp/crm-subnav"
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
  const { lang } = useLang()
  const t = useT(lang)
  const [memberId, setMemberId] = React.useState("")
  const [rows, setRows] = React.useState<VisitRow[]>([])
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

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

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

        <Card className="mt-4">
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
      </div>
    </div>
  )
}
