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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CalendarCheck, Search, Image } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage as translateApiMsg } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { useStoreList, getLeavePendingList, processLeaveApproval } from "@/lib/api-client"

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
  const [leaveList, setLeaveList] = useState<{ id: number; store: string; name: string; nick: string; type: string; date: string; requestDate: string; reason: string; status: string; certificateUrl: string }[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)
  const [certPreviewUrl, setCertPreviewUrl] = useState<string | null>(null)

  const { stores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === 'director' || auth.role === 'officer'
    queueMicrotask(() => {
      if (isOffice) {
        setLeaveStores(["All", ...storeList.filter((s) => s !== "All")])
      } else {
        setLeaveStores([auth.store])
        setLeaveStoreFilter(auth.store)
      }
    })
  }, [auth?.store, auth?.role, storeList])

  const statusLabelMap: Record<string, string> = { "대기": "statusPending", "승인": "statusApproved", "반려": "statusRejected" }
  const leaveTypeToKey: Record<string, string> = { "연차": "annual", "ลากิจ": "lakij", "반차": "half", "병가": "sick", "무급휴가": "unpaid" }
  const translateLeaveType = (type: string) => leaveTypeToKey[type] ? t(leaveTypeToKey[type] as "annual" | "half" | "sick" | "unpaid" | "lakij") : type

  const translateApiMessage = (msg: string | undefined) => translateApiMsg(msg, t)

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
      alert(translateApiMessage(res.message) || t("processFail"))
    }
  }

  return (
    <>
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
              <SelectItem value="ลากิจ">{t("lakij")}</SelectItem>
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
                  <th className="p-2 text-center font-medium w-20">{t("leave_col_cert")}</th>
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
                      {(item.type.indexOf("병가") !== -1 || item.type.indexOf("ลากิจ") !== -1) ? (
                        item.certificateUrl ? (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setCertPreviewUrl(item.certificateUrl)} title={item.type.indexOf("ลากิจ") !== -1 ? t("leaveProofView") : t("leaveCertView")}>
                            <Image className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-amber-600 text-xs font-medium" title={t("leaveCertPending")}>{t("leaveCertPending")}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {item.status === "대기" ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <Button size="sm" className="h-7 px-2 text-xs font-medium" onClick={() => handleLeaveApprove(item.id, "승인")}>{t("adminApproved")}</Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-medium" onClick={() => handleLeaveApprove(item.id, "반려")}>{t("adminRejected")}</Button>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs font-medium text-destructive hover:text-destructive" onClick={() => { if (window.confirm(t("leaveDeleteConfirm") || "이 휴가 신청을 삭제하시겠습니까?")) handleLeaveApprove(item.id, "삭제") }}>{t("delete")}</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <Badge variant={item.status === "승인" ? "default" : "outline"} className="text-xs">{t(statusLabelMap[item.status] || item.status)}</Badge>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => { if (window.confirm(t("leaveDeleteConfirm") || "이 휴가 신청을 삭제하시겠습니까?")) handleLeaveApprove(item.id, "삭제") }}>{t("delete")}</Button>
                        </div>
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

    <Dialog open={!!certPreviewUrl} onOpenChange={(open) => !open && setCertPreviewUrl(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("leaveCertView")}</DialogTitle>
        </DialogHeader>
        {certPreviewUrl && (
          <div className="overflow-hidden rounded-md">
            <img src={certPreviewUrl} alt={t("leaveCertView")} className="w-full h-auto max-h-[70vh] object-contain" />
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
