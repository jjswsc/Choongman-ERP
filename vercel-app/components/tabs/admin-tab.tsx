"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
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
import { UserCog, Search, Palmtree } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage as translateApiMsg } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import {
  useStoreList,
  getAttendancePendingList,
  processAttendanceApproval,
  getAttendanceNoRecordList,
  createAttendanceFromSchedule,
  type AttendanceNoRecordRow,
} from "@/lib/api-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NoticeCompose } from "@/components/erp/notice-compose"
import { NoticeHistory } from "@/components/erp/notice-history"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function weekAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

export function AdminTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  // 근태 승인
  const [attStart, setAttStart] = useState(todayStr)
  const [attEnd, setAttEnd] = useState(todayStr)
  const [attStoreFilter, setAttStoreFilter] = useState("All")
  const [attStores, setAttStores] = useState<string[]>([])
  const [attList, setAttList] = useState<{ id: number; log_at: string; store_name: string; name: string; nick?: string; log_type: string; status?: string; approved?: string; late_min?: number; ot_min?: number }[]>([])
  const [noRecordList, setNoRecordList] = useState<AttendanceNoRecordRow[]>([])
  const [attLoading, setAttLoading] = useState(false)
  const [attMode, setAttMode] = useState<"pending" | "noRecord">("pending")
  const [otMinutesByItem, setOtMinutesByItem] = useState<Record<number, string>>({})

  const { stores: storeList } = useStoreList()
  const isOffice = auth?.role && ["director", "officer", "ceo", "hr"].some((r) => String(auth?.role || "").toLowerCase().includes(r))

  useEffect(() => {
    if (!auth) return
    if (isOffice) {
      setAttStores(["All", ...storeList.filter((s) => s !== "All")])
    } else if (auth.store) {
      setAttStores([auth.store])
      setAttStoreFilter(auth.store)
    }
  }, [auth, isOffice, storeList])

  const translateApiMessage = (msg: string | undefined) => translateApiMsg(msg, t)

  const loadAttList = useCallback(() => {
    if (!auth) return
    if (attStores.length === 0 && !isOffice) return
    setAttLoading(true)
    getAttendancePendingList({
      startStr: attStart,
      endStr: attEnd,
      store: attStoreFilter === "All" ? undefined : attStoreFilter,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
      .then(setAttList)
      .catch(() => setAttList([]))
      .finally(() => setAttLoading(false))
  }, [auth, attStores.length, isOffice, attStart, attEnd, attStoreFilter])

  const loadNoRecordList = useCallback(() => {
    if (!auth) return
    if (attStores.length === 0 && !isOffice) return
    setAttLoading(true)
    getAttendanceNoRecordList({
      startStr: attStart,
      endStr: attEnd,
      store: attStoreFilter === "All" ? undefined : attStoreFilter,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
      .then(setNoRecordList)
      .catch(() => setNoRecordList([]))
      .finally(() => setAttLoading(false))
  }, [auth, attStores.length, isOffice, attStart, attEnd, attStoreFilter])

  const handleSearch = useCallback(() => {
    if (attMode === "pending") loadAttList()
    else loadNoRecordList()
  }, [attMode, loadAttList, loadNoRecordList])

  useEffect(() => {
    if (auth && attStores.length > 0) {
      if (attMode === "pending") loadAttList()
      else loadNoRecordList()
    }
  }, [auth?.store, auth?.role, attStart, attEnd, attStoreFilter, attStores.length, attMode, loadAttList, loadNoRecordList])

  const handleEmergencyApprove = async (row: AttendanceNoRecordRow) => {
    if (!auth) return
    const res = await createAttendanceFromSchedule({
      date: row.date,
      store: row.store,
      name: row.name,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) {
      loadNoRecordList()
    } else {
      alert(translateApiMessage(res.message) || t("processFail"))
    }
  }

  const handleAttApprove = async (id: number, decision: string, optOtMinutes?: number | null, waiveLate?: boolean) => {
    if (!auth) return
    const res = await processAttendanceApproval({
      id,
      decision,
      optOtMinutes: optOtMinutes ?? undefined,
      waiveLate,
      userStore: auth.store || "",
      userRole: auth.role || "",
    })
    if (res.success) {
      setOtMinutesByItem((p) => {
        const next = { ...p }
        delete next[id]
        return next
      })
      loadAttList()
    } else {
      alert(translateApiMessage(res.message) || t("processFail"))
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 공지사항 (탭: 새 공지 보내기 | 발송 내역) */}
      <Tabs defaultValue="compose" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-3">
          <TabsTrigger value="compose" className="text-sm font-medium">
            {t("noticeNewTitle")}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-sm font-medium">
            {t("noticeHistoryTitle")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="compose">
          <NoticeCompose />
        </TabsContent>
        <TabsContent value="history">
          <NoticeHistory />
        </TabsContent>
      </Tabs>

      {/* 휴가 관리 링크 */}
      <Link href="/admin/leave">
        <Card className="shadow-sm hover:bg-muted/50 transition-colors cursor-pointer">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Palmtree className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-foreground">{t("adminLeave")}</p>
              <p className="text-xs text-muted-foreground">{t("adminLeaveApproval")}</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Attendance Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("adminAttApproval")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground -mt-1">{t("adminAttMobileHelp")}</p>
          <Tabs value={attMode} onValueChange={(v) => setAttMode(v as "pending" | "noRecord")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending" className="text-xs">{t("att_pending_only")}</TabsTrigger>
              <TabsTrigger value="noRecord" className="text-xs">{t("att_tab_no_record")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">{t("att_start_date")}</label>
              <Input type="date" value={attStart} onChange={(e) => setAttStart(e.target.value)} className="h-9 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">{t("att_end_date")}</label>
              <Input type="date" value={attEnd} onChange={(e) => setAttEnd(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">{t("stockFilterStore")}</label>
            <Select value={attStoreFilter} onValueChange={setAttStoreFilter}>
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent>
                {attStores.map((st) => (
                  <SelectItem key={st} value={st}>{st === "All" ? t("noticeFilterAll") : st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium" onClick={handleSearch} disabled={attLoading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {attLoading ? t("loading") : t("stockBtnSearch")}
          </Button>
          <div className="flex flex-col gap-2">
            {attMode === "pending" ? (
            attList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <UserCog className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground">{t("adminAttNoPending")}</p>
              </div>
            ) : (
              attList.map((item) => {
                const isIn = String(item.log_type || "").includes("출근") || String(item.log_type || "").toLowerCase().includes("in")
                const hasLate = (item.late_min ?? 0) > 0
                const otVal = otMinutesByItem[item.id] ?? String(item.ot_min ?? 0)
                return (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5">
                    <div className="min-w-0 flex-1 shrink">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-foreground">{item.name}</span>
                        {item.nick && <span className="text-[10px] text-muted-foreground">({item.nick})</span>}
                        <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${isIn ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                          {isIn ? t("att_col_in") : t("att_col_out")}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.log_at} {item.store_name}
                        {hasLate && isIn && (
                          <span className="text-red-600 dark:text-red-400 font-semibold ml-0.5">
                            · {t("att_late_label")} {item.late_min}{t("att_min_unit")}
                          </span>
                        )}
                        {!isIn && (item.ot_min ?? 0) > 0 && (
                          <span className="text-green-600 dark:text-green-400 font-semibold ml-0.5">
                            · {t("att_ot_label")} {item.ot_min}{t("att_min_unit")}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {!isIn && (
                        <Input
                          type="number"
                          min={0}
                          max={999}
                          placeholder="0"
                          value={otVal}
                          onChange={(e) => setOtMinutesByItem((p) => ({ ...p, [item.id]: e.target.value }))}
                          className="h-8 w-16 text-sm text-center py-0 min-w-[3.5rem]"
                        />
                      )}
                      {isIn ? (
                        <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleAttApprove(item.id, "승인완료", undefined, hasLate)}>{t("att_approve_in")}</Button>
                      ) : (
                        <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => { const n = parseInt(otVal, 10); handleAttApprove(item.id, "승인완료", !isNaN(n) && n >= 0 ? n : undefined); }}>{t("att_approve_out")}</Button>
                      )}
                      <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => handleAttApprove(item.id, "반려")}>{t("att_btn_reject")}</Button>
                    </div>
                  </div>
                )
              })
            )
            ) : (
            noRecordList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <UserCog className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground">{t("adminAttNoRecord")}</p>
              </div>
            ) : (
              noRecordList.map((row) => (
                <div key={`${row.date}-${row.store}-${row.name}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5">
                  <div className="min-w-0 flex-1 shrink">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{row.name}</span>
                      {row.nick && <span className="text-[10px] text-muted-foreground">({row.nick})</span>}
                      <span className="text-[10px] px-1 py-0.5 rounded shrink-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {t("att_tab_no_record")}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {row.date} {row.store} · {row.inTimeStr}~{row.outTimeStr}
                    </p>
                  </div>
                  <Button size="sm" className="h-7 px-2 text-[10px] shrink-0" onClick={() => handleEmergencyApprove(row)}>
                    {t("att_btn_emergency_approve")}
                  </Button>
                </div>
              ))
            )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
