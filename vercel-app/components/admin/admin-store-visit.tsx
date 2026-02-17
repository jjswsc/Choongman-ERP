"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  useStoreList,
  getAdminEmployeeList,
  getStoreVisitHistory,
  type StoreVisitHistoryItem,
  type StoreVisitStatsItem,
} from "@/lib/api-client"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function StatsBlock({ items, maxMin, minUnit }: { items: StoreVisitStatsItem[]; maxMin: number; minUnit: string }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground py-4">-</p>
  const m = Math.max(maxMin, 1)
  return (
    <div className="space-y-1">
      <table className="w-full text-xs">
        <tbody>
          {items.slice(0, 15).map((it) => (
            <tr key={it.label} className="border-b border-border/40">
              <td className="py-1 pr-2 align-middle w-28 truncate" title={it.label}>{it.label}</td>
              <td className="py-1 w-24 align-middle">
                <div className="flex gap-1 items-center">
                  <div className="flex-1 min-w-0 h-4 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded"
                      style={{ width: `${(it.minutes / m) * 100}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-medium w-12 text-right">{it.minutes}{minUnit}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminStoreVisit() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [tab, setTab] = useState<"list" | "stats">("list")
  const [stores, setStores] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [officeEmployees, setOfficeEmployees] = useState<string[]>([])

  const [listStart, setListStart] = useState(todayStr())
  const [listEnd, setListEnd] = useState(todayStr())
  const [listStore, setListStore] = useState("All")
  const [listDept, setListDept] = useState("All")
  const [listEmployee, setListEmployee] = useState("All")
  const [listPurpose, setListPurpose] = useState("__all__")
  const [historyList, setHistoryList] = useState<StoreVisitHistoryItem[]>([])
  const [listLoading, setListLoading] = useState(false)

  const [statsStart, setStatsStart] = useState(todayStr())
  const [statsEnd, setStatsEnd] = useState(todayStr())
  const [statsShowDept, setStatsShowDept] = useState(true)
  const [statsShowEmployee, setStatsShowEmployee] = useState(true)
  const [statsShowStore, setStatsShowStore] = useState(true)
  const [statsShowPurpose, setStatsShowPurpose] = useState(true)
  const [statsData, setStatsData] = useState<{ byDept: StoreVisitStatsItem[]; byEmployee: StoreVisitStatsItem[]; byStore: StoreVisitStatsItem[]; byPurpose: StoreVisitStatsItem[] }>({
    byDept: [],
    byEmployee: [],
    byStore: [],
    byPurpose: [],
  })
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  const { stores: storeKeys } = useStoreList()
  const loadOptions = useCallback(async () => {
    setStores(["All", ...storeKeys.filter((s) => s !== "All")])
    const empRes = await getAdminEmployeeList({ userStore: auth?.store || "", userRole: auth?.role || "director" })

    const deptSet = new Set<string>()
    const empList: string[] = []
    for (const e of empRes.list || []) {
      const st = String(e.store || "").trim()
      const stLower = st.toLowerCase()
      const isOffice = OFFICE_STORES.some((o) => st === o || stLower.includes(o.toLowerCase()))
      if (!isOffice) continue
      const dept = String(e.job || "").trim() || "Staff"
      deptSet.add(dept)
      const name = String(e.nick || "").trim() || String(e.name || "").trim()
      if (name && !empList.includes(name)) empList.push(name)
    }
    setDepartments(["All", ...Array.from(deptSet).sort()])
    setOfficeEmployees(["All", ...empList.sort()])
  }, [auth?.store, auth?.role, storeKeys])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  const loadHistory = useCallback(async () => {
    setListLoading(true)
    try {
      const list = await getStoreVisitHistory({
        startStr: listStart,
        endStr: listEnd,
        store: listStore === "All" ? undefined : listStore,
        employeeName: listEmployee === "All" ? undefined : listEmployee,
        department: listDept === "All" ? undefined : listDept,
        purpose: listPurpose && listPurpose !== "__all__" ? listPurpose : undefined,
      })
      setHistoryList(list || [])
    } catch {
      setHistoryList([])
    } finally {
      setListLoading(false)
    }
  }, [listStart, listEnd, listStore, listEmployee, listDept, listPurpose])

  const loadStats = useCallback(async () => {
    if (!statsShowDept && !statsShowEmployee && !statsShowStore && !statsShowPurpose) {
      alert(t("visit_stats_select_hint"))
      return
    }
    setStatsLoading(true)
    setStatsError(null)
    try {
      const res = await fetch(`/api/getStoreVisitStats?start=${statsStart}&end=${statsEnd}`)
      const data = await res.json()
      if (!res.ok) {
        setStatsError(data?.message || String(res.status))
        setStatsData({ byDept: [], byEmployee: [], byStore: [], byPurpose: [] })
      } else {
        setStatsData(data || { byDept: [], byEmployee: [], byStore: [], byPurpose: [] })
      }
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : String(e))
      setStatsData({ byDept: [], byEmployee: [], byStore: [], byPurpose: [] })
    } finally {
      setStatsLoading(false)
    }
  }, [statsStart, statsEnd, statsShowDept, statsShowEmployee, statsShowStore, statsShowPurpose, t])

  useEffect(() => {
    if (tab === "stats" && (statsShowDept || statsShowEmployee || statsShowStore || statsShowPurpose)) {
      loadStats()
    }
  }, [tab, statsShowDept, statsShowEmployee, statsShowStore, statsShowPurpose, loadStats])

  const maxMinutes = Math.max(
    ...statsData.byDept.map((x) => x.minutes),
    ...statsData.byEmployee.map((x) => x.minutes),
    ...statsData.byStore.map((x) => x.minutes),
    ...statsData.byPurpose.map((x) => x.minutes),
    1
  )

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">{t("adminStoreVisit")}</h1>
          <p className="text-xs text-muted-foreground">{t("visit_page_title")}</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "list" | "stats")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="list">{t("tab_visit_list")}</TabsTrigger>
            <TabsTrigger value="stats">{t("tab_visit_stats")}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-2 mb-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("visit_start_date")}</label>
                    <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 w-[130px] text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("visit_end_date")}</label>
                    <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
                  </div>
                  <Select value={listStore} onValueChange={setListStore}>
                    <SelectTrigger className="h-9 w-[120px] text-xs">
                      <SelectValue placeholder={t("store")} />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map((st) => (
                        <SelectItem key={st} value={st}>{st === "All" ? t("all") : st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listDept} onValueChange={setListDept}>
                    <SelectTrigger className="h-9 w-[100px] text-xs">
                      <SelectValue placeholder={t("visit_dept_col")} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d} value={d}>{d === "All" ? t("all") : d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listEmployee} onValueChange={setListEmployee}>
                    <SelectTrigger className="h-9 w-[110px] text-xs">
                      <SelectValue placeholder={t("visit_employee_office")} />
                    </SelectTrigger>
                    <SelectContent>
                      {officeEmployees.map((emp) => (
                        <SelectItem key={emp} value={emp}>{emp === "All" ? t("all") : emp}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={listPurpose} onValueChange={setListPurpose}>
                    <SelectTrigger className="h-9 w-[110px] text-xs">
                      <SelectValue placeholder={t("visit_col_purpose")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      <SelectItem value="정기 점검">{t("visitPurposeInspect")}</SelectItem>
                      <SelectItem value="직원 교육">{t("visitPurposeTraining")}</SelectItem>
                      <SelectItem value="긴급 지원">{t("visitPurposeUrgent")}</SelectItem>
                      <SelectItem value="매장 미팅">{t("visitPurposeMeeting")}</SelectItem>
                      <SelectItem value="물건 배송">{t("visitPurposeDelivery")}</SelectItem>
                      <SelectItem value="기타">{t("visitPurposeEtc")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button className="h-9 font-medium" onClick={loadHistory} disabled={listLoading}>
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {listLoading ? t("loading") : t("search")}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-center font-medium">{t("visit_col_date")}</th>
                        <th className="p-2 text-center font-medium">{t("visit_col_time")}</th>
                        <th className="p-2 text-center font-medium">{t("visit_col_visitor")}</th>
                        <th className="p-2 text-center font-medium">{t("visit_col_store")}</th>
                        <th className="p-2 text-center font-medium">{t("visit_col_type")}</th>
                        <th className="p-2 text-center font-medium">{t("visit_col_purpose")}</th>
                        <th className="p-2 text-center font-medium">{t("visit_col_duration")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listLoading ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">{t("loading")}</td>
                        </tr>
                      ) : historyList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">{t("visit_query_please")}</td>
                        </tr>
                      ) : (
                        historyList.map((h, i) => (
                          <tr key={i} className="border-b border-border/60 hover:bg-muted/30">
                            <td className="p-2 text-center">{h.date}</td>
                            <td className="p-2 text-center">{h.time}</td>
                            <td className="p-2 text-center font-medium">{h.name}</td>
                            <td className="p-2 text-center">{h.store}</td>
                            <td className="p-2 text-center">{h.type}</td>
                            <td className="p-2 text-center">{h.purpose || "-"}</td>
                            <td className="p-2 text-center font-medium">{h.duration ? `${h.duration}${t("att_min_unit")}` : "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-2 mb-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("visit_start_date")}</label>
                    <Input type="date" value={statsStart} onChange={(e) => setStatsStart(e.target.value)} className="h-9 w-[130px] text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("visit_end_date")}</label>
                    <Input type="date" value={statsEnd} onChange={(e) => setStatsEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
                  </div>
                  <div className="flex items-center gap-3 pl-2 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={statsShowDept} onCheckedChange={(v) => setStatsShowDept(!!v)} />
                      {t("visit_stat_dept")}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={statsShowEmployee} onCheckedChange={(v) => setStatsShowEmployee(!!v)} />
                      {t("visit_stat_employee")}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={statsShowStore} onCheckedChange={(v) => setStatsShowStore(!!v)} />
                      {t("visit_stat_store")}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={statsShowPurpose} onCheckedChange={(v) => setStatsShowPurpose(!!v)} />
                      {t("visit_stat_purpose")}
                    </label>
                  </div>
                  <Button className="h-9 font-medium" onClick={loadStats} disabled={statsLoading}>
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                    {statsLoading ? t("loading") : t("visit_stats_query_btn")}
                  </Button>
                </div>

                {statsError && (
                  <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {t("visit_stats_error") || "통계 조회 오류"}: {statsError}
                  </div>
                )}
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-medium">{t("visit_stat_category") || "구분"}</th>
                        <th className="p-2 text-left font-medium">{t("visit_stat_item") || "항목"}</th>
                        <th className="p-2 text-right font-medium">{t("visit_col_duration")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statsShowDept && statsData.byDept.map((it) => (
                        <tr key={"dept-" + it.label} className="border-b border-border/40">
                          <td className="p-2">{t("visit_chart_dept")}</td>
                          <td className="p-2 font-medium">{it.label}</td>
                          <td className="p-2 text-right">{it.minutes}{t("att_min_unit")}</td>
                        </tr>
                      ))}
                      {statsShowEmployee && statsData.byEmployee.map((it) => (
                        <tr key={"emp-" + it.label} className="border-b border-border/40">
                          <td className="p-2">{t("visit_chart_employee")}</td>
                          <td className="p-2 font-medium">{it.label}</td>
                          <td className="p-2 text-right">{it.minutes}{t("att_min_unit")}</td>
                        </tr>
                      ))}
                      {statsShowStore && statsData.byStore.map((it) => (
                        <tr key={"store-" + it.label} className="border-b border-border/40">
                          <td className="p-2">{t("visit_chart_store")}</td>
                          <td className="p-2 font-medium">{it.label}</td>
                          <td className="p-2 text-right">{it.minutes}{t("att_min_unit")}</td>
                        </tr>
                      ))}
                      {statsShowPurpose && statsData.byPurpose.map((it) => (
                        <tr key={"purpose-" + it.label} className="border-b border-border/40">
                          <td className="p-2">{t("visit_chart_purpose")}</td>
                          <td className="p-2 font-medium">{it.label}</td>
                          <td className="p-2 text-right">{it.minutes}{t("att_min_unit")}</td>
                        </tr>
                      ))}
                      {!statsLoading && !statsError && statsData.byDept.length === 0 && statsData.byEmployee.length === 0 && statsData.byStore.length === 0 && statsData.byPurpose.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-6 text-center text-muted-foreground">{t("visit_stats_no_data") || "해당 기간에 집계된 방문 데이터가 없습니다."}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {statsShowDept && (
                    <div className="rounded-lg border p-4">
                      <h6 className="font-semibold text-primary mb-3 text-sm">{t("visit_chart_dept")}</h6>
                      <StatsBlock items={statsData.byDept} maxMin={maxMinutes} minUnit={t("att_min_unit")} />
                    </div>
                  )}
                  {statsShowEmployee && (
                    <div className="rounded-lg border p-4">
                      <h6 className="font-semibold text-green-600 dark:text-green-500 mb-3 text-sm">{t("visit_chart_employee")}</h6>
                      <StatsBlock items={statsData.byEmployee} maxMin={maxMinutes} minUnit={t("att_min_unit")} />
                    </div>
                  )}
                  {statsShowStore && (
                    <div className="rounded-lg border p-4">
                      <h6 className="font-semibold text-blue-600 dark:text-blue-500 mb-3 text-sm">{t("visit_chart_store")}</h6>
                      <StatsBlock items={statsData.byStore} maxMin={maxMinutes} minUnit={t("att_min_unit")} />
                    </div>
                  )}
                  {statsShowPurpose && (
                    <div className="rounded-lg border p-4">
                      <h6 className="font-semibold text-amber-600 dark:text-amber-500 mb-3 text-sm">{t("visit_chart_purpose")}</h6>
                      <StatsBlock items={statsData.byPurpose} maxMin={maxMinutes} minUnit={t("att_min_unit")} />
                    </div>
                  )}
                  {!statsShowDept && !statsShowEmployee && !statsShowStore && !statsShowPurpose && (
                    <p className="col-span-full text-sm text-muted-foreground py-4">{t("visit_stats_select_hint")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
