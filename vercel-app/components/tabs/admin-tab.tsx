"use client"

import { useState, useEffect } from "react"
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
import { Badge } from "@/components/ui/badge"
import { CalendarCheck, UserCog, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getLoginData,
  getLeavePendingList,
  processLeaveApproval,
  getAttendancePendingList,
  processAttendanceApproval,
} from "@/lib/api-client"
import { NoticeCompose } from "@/components/erp/notice-compose"
import { NoticeHistory } from "@/components/erp/notice-history"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function AdminTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  // 연차 승인
  const [leaveDateFilterType, setLeaveDateFilterType] = useState<'request' | 'leave'>('leave')
  const [leaveStart, setLeaveStart] = useState(todayStr)
  const [leaveEnd, setLeaveEnd] = useState(todayStr)
  const [leaveStoreFilter, setLeaveStoreFilter] = useState("All")
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("대기")
  const [leaveStores, setLeaveStores] = useState<string[]>([])
  const [leaveList, setLeaveList] = useState<{ id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string }[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)

  // 근태 승인
  const [attStart, setAttStart] = useState(todayStr)
  const [attEnd, setAttEnd] = useState(todayStr)
  const [attStoreFilter, setAttStoreFilter] = useState("All")
  const [attStores, setAttStores] = useState<string[]>([])
  const [attList, setAttList] = useState<{ id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }[]>([])
  const [attLoading, setAttLoading] = useState(false)

  useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === 'director' || auth.role === 'officer'
    getLoginData().then((r) => {
      const stores = Object.keys(r.users || {}).filter(Boolean).sort()
      if (isOffice) {
        setLeaveStores(["All", ...stores])
        setAttStores(["All", ...stores])
      } else {
        setLeaveStores([auth.store])
        setAttStores([auth.store])
        setLeaveStoreFilter(auth.store)
        setAttStoreFilter(auth.store)
      }
    })
  }, [auth])

  const statusLabelMap: Record<string, string> = { "대기": "statusPending", "승인": "statusApproved", "반려": "statusRejected" }

  const loadLeaveList = () => {
    if (!auth?.store) return
    setLeaveLoading(true)
    getLeavePendingList({
      startStr: leaveStart,
      endStr: leaveEnd,
      store: leaveStoreFilter === "All" ? undefined : leaveStoreFilter,
      status: leaveStatusFilter,
      userStore: auth.store,
      userRole: auth.role,
      dateFilterType: leaveDateFilterType,
    })
      .then(setLeaveList)
      .catch(() => setLeaveList([]))
      .finally(() => setLeaveLoading(false))
  }

  const handleLeaveApprove = async (id: number, decision: string) => {
    if (!auth?.store) return
    const res = await processLeaveApproval({ id, decision, userStore: auth.store, userRole: auth.role })
    if (res.success) loadLeaveList()
    else alert(res.message || "처리 실패")
  }

  const loadAttList = () => {
    if (!auth?.store) return
    setAttLoading(true)
    getAttendancePendingList({
      startStr: attStart,
      endStr: attEnd,
      store: attStoreFilter === "All" ? undefined : attStoreFilter,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setAttList)
      .catch(() => setAttList([]))
      .finally(() => setAttLoading(false))
  }

  const handleAttApprove = async (id: number, decision: string) => {
    if (!auth?.store) return
    const res = await processAttendanceApproval({ id, decision, userStore: auth.store, userRole: auth.role })
    if (res.success) loadAttList()
    else alert(res.message || "처리 실패")
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* 공지 발송 + 발송 내역 (v0 디자인) */}
      <NoticeCompose />
      <NoticeHistory />

      {/* Leave Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("adminLeaveApproval")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={leaveDateFilterType} onValueChange={(v: 'request' | 'leave') => setLeaveDateFilterType(v)}>
              <SelectTrigger className="h-9 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="request">{t("adminLeaveByRequest")}</SelectItem>
                <SelectItem value="leave">{t("adminLeaveByLeave")}</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="h-9 flex-1 text-xs" />
            <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="h-9 flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Select value={leaveStoreFilter} onValueChange={setLeaveStoreFilter}>
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder={t("store")} />
              </SelectTrigger>
              <SelectContent>
                {leaveStores.map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={leaveStatusFilter} onValueChange={setLeaveStatusFilter}>
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="대기">{t("statusPending")}</SelectItem>
                <SelectItem value="승인">{t("statusApproved")}</SelectItem>
                <SelectItem value="반려">{t("statusRejected")}</SelectItem>
                <SelectItem value="All">{t("all")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium" onClick={loadLeaveList} disabled={leaveLoading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {leaveLoading ? t("loading") : t("search")}
          </Button>
          <div className="flex flex-col gap-2">
            {leaveList.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("adminLeaveNoResult")}</p>
            ) : (
              leaveList.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}{item.nick ? ` (${item.nick})` : ""} · {item.store}</p>
                    <p className="text-xs text-muted-foreground">{t("adminLeaveRequest")} {item.requestDate} · {t("adminLeaveDate")} {item.date} · {item.type} {item.reason ? `· ${item.reason}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.status === "대기" && (
                      <>
                        <Button size="sm" className="h-7 px-3 text-xs font-medium" onClick={() => handleLeaveApprove(item.id, "승인")}>{t("adminApproved")}</Button>
                        <Button variant="outline" size="sm" className="h-7 px-3 text-xs font-medium" onClick={() => handleLeaveApprove(item.id, "반려")}>{t("adminRejected")}</Button>
                      </>
                    )}
                    {item.status !== "대기" && (
                      <Badge variant={item.status === "승인" ? "default" : "outline"} className="text-xs">{t(statusLabelMap[item.status] || item.status)}</Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("adminAttApproval")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input type="date" value={attStart} onChange={(e) => setAttStart(e.target.value)} className="h-9 flex-1 text-xs" />
            <Input type="date" value={attEnd} onChange={(e) => setAttEnd(e.target.value)} className="h-9 flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Select value={attStoreFilter} onValueChange={setAttStoreFilter}>
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent>
                {attStores.map((st) => (
                  <SelectItem key={st} value={st}>{st}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium" onClick={loadAttList} disabled={attLoading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {attLoading ? t("loading") : t("search")}
          </Button>
          <div className="flex flex-col gap-2">
            {attList.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center">
                <UserCog className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground">{t("adminAttNoPending")}</p>
              </div>
            ) : (
              attList.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name} · {item.store_name}</p>
                    <p className="text-xs text-muted-foreground">{item.log_at} · {item.log_type}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" className="h-7 px-3 text-xs font-medium" onClick={() => handleAttApprove(item.id, "승인완료")}>{t("adminApproved")}</Button>
                    <Button variant="outline" size="sm" className="h-7 px-3 text-xs font-medium" onClick={() => handleAttApprove(item.id, "반려")}>{t("adminRejected")}</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
