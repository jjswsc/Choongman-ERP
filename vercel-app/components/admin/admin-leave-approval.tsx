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
import { CalendarCheck, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { getLoginData, getLeavePendingList, processLeaveApproval } from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function AdminLeaveApproval() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [leaveDateFilterType, setLeaveDateFilterType] = useState<'request' | 'leave'>('leave')
  const [leaveStart, setLeaveStart] = useState(todayStr)
  const [leaveEnd, setLeaveEnd] = useState(todayStr)
  const [leaveStoreFilter, setLeaveStoreFilter] = useState("All")
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("All")
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("대기")
  const [leaveStores, setLeaveStores] = useState<string[]>([])
  const [leaveList, setLeaveList] = useState<{ id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string }[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)

  useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === 'director' || auth.role === 'officer'
    getLoginData().then((r) => {
      const stores = Object.keys(r.users || {}).filter(Boolean).sort()
      if (isOffice) {
        setLeaveStores(["All", ...stores])
      } else {
        setLeaveStores([auth.store])
        setLeaveStoreFilter(auth.store)
      }
    })
  }, [auth])

  const statusLabelMap: Record<string, string> = { "대기": "statusPending", "승인": "statusApproved", "반려": "statusRejected" }
  const leaveTypeToKey: Record<string, string> = { "연차": "annual", "반차": "half", "병가": "sick", "무급휴가": "unpaid" }
  const translateLeaveType = (type: string) => leaveTypeToKey[type] ? t(leaveTypeToKey[type] as "annual" | "half" | "sick" | "unpaid") : type

  const translateApiMessage = (msg: string | undefined): string => {
    if (!msg) return t("processFail")
    if (msg === "잘못된 요청입니다.") return t("invalidRequest")
    if (msg === "승인 또는 반려를 선택해 주세요.") return t("selectApproveOrReject")
    if (msg === "해당 휴가 신청을 찾을 수 없습니다.") return t("leaveRequestNotFound")
    if (msg === "해당 매장의 휴가만 승인할 수 있습니다.") return t("leaveStoreOnly")
    if (msg === "처리되었습니다.") return t("processSuccess")
    if (msg.startsWith("처리 실패:")) return t("processFail") + msg.slice("처리 실패:".length)
    return msg
  }

  const loadLeaveList = () => {
    if (!auth?.store) return
    setLeaveLoading(true)
    getLeavePendingList({
      startStr: leaveStart,
      endStr: leaveEnd,
      store: leaveStoreFilter === "All" ? undefined : leaveStoreFilter,
      typeFilter: leaveTypeFilter === "All" ? undefined : leaveTypeFilter,
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
    if (res.success) {
      loadLeaveList()
    } else {
      alert(translateApiMessage(res.message))
    }
  }

  return (
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
          <Input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="h-9 w-[130px] text-xs" />
          <Input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
          <Select value={leaveStoreFilter} onValueChange={setLeaveStoreFilter}>
            <SelectTrigger className="h-9 w-[100px] text-xs">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {leaveStores.map((st) => (
                <SelectItem key={st} value={st}>{st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={leaveTypeFilter} onValueChange={setLeaveTypeFilter}>
            <SelectTrigger className="h-9 w-[90px] text-xs">
              <SelectValue placeholder={t("leave_col_type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t("all")}</SelectItem>
              <SelectItem value="연차">{t("annual")}</SelectItem>
              <SelectItem value="반차">{t("half")}</SelectItem>
              <SelectItem value="병가">{t("sick")}</SelectItem>
              <SelectItem value="무급휴가">{t("unpaid")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={leaveStatusFilter} onValueChange={setLeaveStatusFilter}>
            <SelectTrigger className="h-9 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="대기">{t("statusPending")}</SelectItem>
              <SelectItem value="승인">{t("statusApproved")}</SelectItem>
              <SelectItem value="반려">{t("statusRejected")}</SelectItem>
              <SelectItem value="All">{t("all")}</SelectItem>
            </SelectContent>
          </Select>
          <Button className="h-9 shrink-0 px-4 font-medium" onClick={loadLeaveList} disabled={leaveLoading}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {leaveLoading ? t("loading") : t("search")}
          </Button>
        </div>
        <div className="overflow-x-auto -mx-2">
          {leaveList.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">{t("adminLeaveNoResult")}</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-center font-medium">{t("store")}</th>
                  <th className="p-2 text-center font-medium min-w-[100px] whitespace-nowrap">{t("leave_col_name")}</th>
                  <th className="p-2 text-center font-medium whitespace-nowrap">{t("leave_col_request_date")}</th>
                  <th className="p-2 text-center font-medium whitespace-nowrap">{t("leave_col_leave_date")}</th>
                  <th className="p-2 text-center font-medium">{t("leave_col_type")}</th>
                  <th className="p-2 text-center font-medium min-w-[200px]">{t("leave_col_reason")}</th>
                  <th className="p-2 text-center font-medium w-28">{t("leave_col_action")}</th>
                </tr>
              </thead>
              <tbody>
                {leaveList.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="p-2 text-center">{item.store}</td>
                    <td className="p-2 text-center whitespace-nowrap">{item.name}{item.nick ? ` (${item.nick})` : ""}</td>
                    <td className="p-2 text-center whitespace-nowrap">{item.requestDate}</td>
                    <td className="p-2 text-center whitespace-nowrap">{item.date}</td>
                    <td className="p-2 text-center">{translateLeaveType(item.type)}</td>
                    <td className="p-2 text-center">{item.reason || "-"}</td>
                    <td className="p-2 text-center">
                      {item.status === "대기" && (
                        <div className="flex items-center justify-center gap-1.5">
                          <Button size="sm" className="h-7 px-2 text-xs font-medium" onClick={() => handleLeaveApprove(item.id, "승인")}>{t("adminApproved")}</Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-medium" onClick={() => handleLeaveApprove(item.id, "반려")}>{t("adminRejected")}</Button>
                        </div>
                      )}
                      {item.status !== "대기" && (
                        <Badge variant={item.status === "승인" ? "default" : "outline"} className="text-xs">{t(statusLabelMap[item.status] || item.status)}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
