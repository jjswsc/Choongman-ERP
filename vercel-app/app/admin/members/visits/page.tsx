"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Search, CalendarDays } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { CrmPageHero, CrmKpiCard, CrmMemberLink } from "@/components/crm/crm-shared-ui"
import { CrmRfmMatrix } from "@/components/crm/crm-rfm-matrix"
import { apiFetch } from "@/lib/api/fetch"
import { getMemberVisits, getMembers, useStoreList } from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { bangkokInclusivePeriod, bangkokTodayYmd } from "@/lib/bangkok-date"
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
  memberName: string
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

function defaultDateRange() {
  const endYmd = bangkokTodayYmd()
  const { startYmd } = bangkokInclusivePeriod(endYmd, 30)
  return { startYmd, endYmd }
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
      memberName: "",
      visitCount,
      avgVisitCycleDays,
      avgTicketAmount,
      totalContribution,
      lastVisitedAt,
    })
  }
  return out.sort((a, b) => b.totalContribution - a.totalContribution)
}

async function loadVisitAnalysis(params: {
  startStr: string
  endStr: string
  storeCode?: string
  memberId?: number
  q?: string
}): Promise<MemberVisitAnalysisRow[]> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
    limit: "500",
  })
  if (params.storeCode && params.storeCode !== "All") q.set("storeCode", params.storeCode)
  if (params.memberId) q.set("memberId", String(params.memberId))
  if (params.q) q.set("q", params.q)
  const res = await apiFetch(`/api/crm/member-visit-analysis?${q}`, { cache: "no-store" })
  const data = (await res.json()) as { rows?: MemberVisitAnalysisRow[] }
  if (data.rows?.length) return data.rows
  return []
}

export default function MemberVisitsPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeKeys } = useStoreList()
  const initialRange = React.useMemo(() => defaultDateRange(), [])
  const [tab, setTab] = React.useState<"history" | "analysis" | "rfm">("history")
  const [startDate, setStartDate] = React.useState(initialRange.startYmd)
  const [endDate, setEndDate] = React.useState(initialRange.endYmd)
  const [storeCode, setStoreCode] = React.useState("All")
  const [memberId, setMemberId] = React.useState("")
  const [memberSearch, setMemberSearch] = React.useState("")
  const [rows, setRows] = React.useState<VisitRow[]>([])
  const [analysisRows, setAnalysisRows] = React.useState<MemberVisitAnalysisRow[]>([])
  const [hasSearched, setHasSearched] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [rfmRows, setRfmRows] = React.useState<RfmRow[]>([])
  const [rfmLoading, setRfmLoading] = React.useState(false)
  const storeOptions = React.useMemo(() => ["All", ...storeKeys.filter((s) => s !== "All")], [storeKeys])
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
    const start = String(startDate || "").trim()
    const end = String(endDate || "").trim()
    if (!start || !end) {
      await appAlert(t("visit_stats_date_hint") || "시작일과 종료일을 선택해 주세요.")
      return
    }
    if (start > end) {
      await appAlert(t("visit_stats_date_hint") || "시작일과 종료일을 선택해 주세요.")
      return
    }
    setLoading(true)
    try {
      let id = Number(memberId || 0)
      const q = memberSearch.trim()
      if (!id && q) {
        const found = await getMembers({ q, limit: 1 })
        id = Number(found[0]?.id || 0)
        if (id) setMemberId(String(id))
      }
      const [list, analysis] = await Promise.all([
        getMemberVisits({
          memberId: id || undefined,
          startStr: start,
          endStr: end,
          storeCode: storeCode === "All" ? undefined : storeCode,
          limit: 500,
        }),
        loadVisitAnalysis({
          startStr: start,
          endStr: end,
          storeCode,
          memberId: id || undefined,
          q: q || undefined,
        }),
      ])
      setRows(list)
      setAnalysisRows(analysis.length ? analysis : buildMemberVisitAnalysis(list))
      setHasSearched(true)
    } catch {
      setRows([])
      setAnalysisRows([])
      setHasSearched(true)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, storeCode, memberId, memberSearch, t])

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
    if (searchParams.get("tab") === "rfm") setTab("rfm")
    const mid = Number(searchParams.get("memberId") || 0)
    if (mid) setMemberId(String(mid))
  }, [searchParams])

  React.useEffect(() => {
    if (tab === "rfm") loadRfm().catch(() => {})
  }, [loadRfm, tab])

  const emptyMessage = hasSearched ? t("noData") || "데이터 없음" : t("memberVisitsSearchHint")

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <CrmPageHero
          icon={CalendarDays}
          title={t("memberVisitsSearchTitle")}
          description={t("memberVisitsSearchHint")}
          gradient="from-cyan-50 to-sky-50"
          border="border-cyan-200/60"
          iconClass="bg-cyan-500/10 text-cyan-600"
        />
        <CrmSubnav />
        <Card className="mb-4">
          <CardHeader><CardTitle>{t("memberVisitsSearchTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs font-semibold block mb-1">{t("visit_start_date")}</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 w-[130px] text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">{t("visit_end_date")}</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 w-[130px] text-xs"
                />
              </div>
              <Select value={storeCode} onValueChange={setStoreCode}>
                <SelectTrigger className="h-9 w-[140px] text-xs">
                  <SelectValue placeholder={t("store")} />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((st) => (
                    <SelectItem key={st} value={st}>{st === "All" ? t("all") : st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t("crmVisitsSearchMemberPh")}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="h-9 w-[180px] text-xs"
              />
              <Input
                placeholder={t("memberVisitsMemberIdPh")}
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="h-9 w-[120px] text-xs"
              />
              <Button className="h-9 font-medium" onClick={() => load()} disabled={loading}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {loading ? t("loading") : t("btn_query")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {hasSearched && (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CrmKpiCard label={t("memberVisitsKpiMembers")} value={kpi.memberCount.toLocaleString()} tone="primary" />
              <CrmKpiCard label={t("memberVisitsAvgTicketAmount")} value={Number(kpi.avgTicketAmount || 0).toLocaleString()} />
              <CrmKpiCard
                label={t("memberVisitsAvgVisitCycleDays")}
                value={kpi.avgVisitCycleDays == null ? "—" : `${kpi.avgVisitCycleDays.toFixed(1)} ${t("days")}`}
              />
              <CrmKpiCard label={t("memberVisitsTotalContribution")} value={Number(kpi.totalContribution || 0).toLocaleString()} tone="success" />
            </div>

            {kpi.topContributor && (
              <Card className="mb-4">
                <CardHeader><CardTitle className="text-sm">{t("memberVisitsTopContributor")}</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  <CrmMemberLink
                    memberId={kpi.topContributor.memberId}
                    name={kpi.topContributor.memberName}
                    memberNo={kpi.topContributor.memberNo}
                  />
                  {" · "}
                  {t("memberVisitsVisitCount")} {kpi.topContributor.visitCount.toLocaleString()} / {t("memberVisitsTotalContribution")}{" "}
                  {Number(kpi.topContributor.totalContribution || 0).toLocaleString()}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as "history" | "analysis" | "rfm")} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="history" className={adminTabsTriggerCn}>
                {t("crmVisitsTabHistory")}
              </TabsTrigger>
              <TabsTrigger value="analysis" className={adminTabsTriggerCn}>
                {t("crmVisitsTabAnalysis")}
              </TabsTrigger>
              <TabsTrigger value="rfm" className={adminTabsTriggerCn}>
                {t("crmVisitsTabRfm")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="history" className={adminTabsContentCn}>
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
                      {loading ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted-foreground">{t("loading")}</td>
                        </tr>
                      ) : !hasSearched || rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted-foreground">{emptyMessage}</td>
                        </tr>
                      ) : (
                        rows.map((r) => (
                          <tr key={r.orderId} className="border-t">
                            <td className="p-2">{r.visitedAt}</td>
                            <td className="p-2">
                              <CrmMemberLink memberId={r.memberId} memberNo={r.memberNo} />
                            </td>
                            <td className="p-2">{r.memberNo}</td>
                            <td className="p-2">{r.storeCode}</td>
                            <td className="p-2">
                              <Link href={`/admin/pos-orders?orderId=${r.orderId}`} className="text-primary hover:underline">
                                {r.orderNo}
                              </Link>
                            </td>
                            <td className="p-2">{Number(r.total || 0).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className={adminTabsContentCn}>
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
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">{t("loading")}</td>
                        </tr>
                      ) : !hasSearched || analysisRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">{emptyMessage}</td>
                        </tr>
                      ) : (
                        analysisRows.map((r) => (
                          <tr key={r.memberId} className="border-t">
                            <td className="p-2">
                              <CrmMemberLink memberId={r.memberId} name={r.memberName} memberNo={r.memberNo} />
                            </td>
                            <td className="p-2">{r.memberNo || "—"}</td>
                            <td className="p-2">{r.visitCount.toLocaleString()}</td>
                            <td className="p-2">
                              {r.avgVisitCycleDays == null ? "-" : `${r.avgVisitCycleDays.toLocaleString()} ${t("days")}`}
                            </td>
                            <td className="p-2">{Number(r.avgTicketAmount || 0).toLocaleString()}</td>
                            <td className="p-2">{Number(r.totalContribution || 0).toLocaleString()}</td>
                            <td className="p-2">{r.lastVisitedAt || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rfm" className={adminTabsContentCn}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("crmVisitsRfmTitle")}</CardTitle>
                <Button variant="outline" onClick={() => loadRfm()} disabled={rfmLoading}>
                  {rfmLoading ? t("loading") : t("adminOpsCenterReload")}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">{t("crmVisitsRfmHint")}</p>
                <CrmRfmMatrix rows={rfmRows} />
                <div className="overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">{t("crmVisitsRfmColMember")}</th>
                        <th className="p-2 text-left">{t("crmVisitsRfmColRecency")}</th>
                        <th className="p-2 text-left">{t("crmVisitsRfmColFrequency")}</th>
                        <th className="p-2 text-left">{t("crmVisitsRfmColMonetary")}</th>
                        <th className="p-2 text-left">R</th>
                        <th className="p-2 text-left">F</th>
                        <th className="p-2 text-left">M</th>
                        <th className="p-2 text-left">RFM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfmRows.map((r) => (
                        <tr key={r.memberId} className="border-t">
                          <td className="p-2">
                            <CrmMemberLink memberId={r.memberId} />
                          </td>
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
