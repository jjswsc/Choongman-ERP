"use client"

import { useState, useEffect } from "react"
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
} from "@/lib/api-client"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NoticeCompose } from "@/components/erp/notice-compose"
import { NoticeHistory } from "@/components/erp/notice-history"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
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
  const [attList, setAttList] = useState<{ id: number; log_at: string; store_name: string; name: string; log_type: string; status?: string; approved?: string }[]>([])
  const [attLoading, setAttLoading] = useState(false)

  const { stores: storeList } = useStoreList()
  useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === 'director' || auth.role === 'officer'
    if (isOffice) {
      setAttStores(["All", ...storeList.filter((s) => s !== "All")])
    } else {
      setAttStores([auth.store])
      setAttStoreFilter(auth.store)
    }
  }, [auth?.store, auth?.role, storeList])

  const translateApiMessage = (msg: string | undefined) => translateApiMsg(msg, t)

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
    if (res.success) {
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
