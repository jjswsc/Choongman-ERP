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
import { hasOfficeStaffScope, isOfficeStore } from "@/lib/permissions"
import {
  useStoreView,
  filterOperationalStorePickerOptions,
} from "@/lib/store-view-context"

const ALL_STORE_VALUE = "All"

export function TimesheetTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: storeListRaw, formatStoreLabel } = useStoreList()
  const { viewStore, setViewStore } = useStoreView()
  const isOffice = hasOfficeStaffScope(auth?.role || "", auth?.store)

  const operationalStores = React.useMemo(
    () => filterOperationalStorePickerOptions(storeListRaw),
    [storeListRaw]
  )

  const storeList = React.useMemo(() => {
    if (!auth?.store) return [] as string[]
    if (isOffice) return [ALL_STORE_VALUE, ...operationalStores]
    return [auth.store]
  }, [auth?.store, isOffice, operationalStores])

  /**
   * 본사 모바일: 상단 매장바(viewStore)와 동일 기준.
   * auth.store가 Office/본사여도 스케줄 없는 HQ로 조회하지 않음(관리자 당일탭과 동일).
   */
  const storeFilter = React.useMemo(() => {
    if (!auth?.store) return ""
    if (!isOffice) return auth.store
    const v = String(viewStore || "").trim()
    if (v === ALL_STORE_VALUE) return ALL_STORE_VALUE
    if (v && !isOfficeStore(v)) {
      if (operationalStores.includes(v) || storeListRaw.includes(v)) return v
    }
    return operationalStores[0] || ALL_STORE_VALUE
  }, [auth?.store, isOffice, viewStore, operationalStores, storeListRaw])

  const onStoreChange = React.useCallback(
    (next: string) => {
      if (isOffice) setViewStore(next)
    },
    [isOffice, setViewStore]
  )

  const branchStoreList = React.useMemo(
    () => storeList.filter((s) => s !== ALL_STORE_VALUE),
    [storeList]
  )

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-lg">
        {/* Page header */}
        <div className="sticky top-0 z-20 border-b bg-card/80 px-4 py-3 backdrop-blur-lg">
          <h1 className="text-base font-bold text-card-foreground">{t("tabTimesheet")}</h1>
          <p className="text-[11px] text-muted-foreground">
            {t("scheduleToday")}, {t("scheduleWeek")}, {t("scheduleMyPunch")}
          </p>
          {/* 매장 검색 - 당일 실시간 근무 & 주간 시간표 공통 (본사는 상단 매장바와 동기) */}
          {storeList.length > 0 && (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                {t("store") || "Store"}
              </label>
              <Select value={storeFilter || undefined} onValueChange={onStoreChange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("scheduleStorePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {storeList.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st === ALL_STORE_VALUE ? t("store_all_stores") : formatStoreLabel(st)}
                    </SelectItem>
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
              <RealtimeWork storeFilter={storeFilter} storeList={branchStoreList} />
              <WeeklySchedule storeFilter={storeFilter} storeList={branchStoreList} />
            </>
          ) : null}
          <MyAttendance />
        </div>
      </div>
    </div>
  )
}
