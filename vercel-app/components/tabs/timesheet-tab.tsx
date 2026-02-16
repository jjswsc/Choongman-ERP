"use client"

import * as React from "react"
import { RealtimeWork } from "@/components/erp/realtime-work"
import { WeeklySchedule } from "@/components/erp/weekly-schedule"
import { MyAttendance } from "@/components/erp/my-attendance"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"

export function TimesheetTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeListRaw } = useStoreList()
  const [storeList, setStoreList] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")

  React.useEffect(() => {
    if (!auth?.store) return
    const stores = [...storeListRaw]
    const isOffice = ["director", "officer", "ceo", "hr"].includes(auth?.role || "")
    if (isOffice && stores.length > 0) {
      setStoreList(stores)
      setStoreFilter(stores.includes(auth.store) ? auth.store : stores[0] || auth.store)
    } else {
      setStoreList([auth.store])
      setStoreFilter(auth.store || "")
    }
  }, [auth?.store, auth?.role, storeListRaw])

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-lg">
        {/* Page header */}
        <div className="sticky top-0 z-20 border-b bg-card/80 px-4 py-3 backdrop-blur-lg">
          <h1 className="text-base font-bold text-card-foreground">{t("tabTimesheet")}</h1>
          <p className="text-[11px] text-muted-foreground">
            {t("scheduleToday")}, {t("scheduleWeek")}, {t("scheduleMyPunch")}
          </p>
          {/* 매장 검색 - 당일 실시간 근무 & 주간 시간표 공통 */}
          {storeList.length > 0 && (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                {t("store") || "매장"}
              </label>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("scheduleStorePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {storeList.map((st) => (
                    <SelectItem key={st} value={st}>{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Content - 선택한 매장만 조회, 로딩 완료 후 표시 */}
        <div className="flex flex-col gap-4 p-4">
          {storeFilter ? (
            <>
              <RealtimeWork storeFilter={storeFilter} storeList={storeList} />
              <WeeklySchedule storeFilter={storeFilter} storeList={storeList} />
            </>
          ) : null}
          <MyAttendance />
        </div>
      </div>
    </div>
  )
}
