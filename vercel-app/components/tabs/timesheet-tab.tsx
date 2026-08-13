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
import { useStoreView } from "@/lib/store-view-context"
import {
  TIMESHEET_ALL_STORE,
  filterHrAttendanceStorePickerOptions,
  resolveTimesheetQueryStore,
  timesheetPickedStoreFromViewStore,
} from "@/lib/timesheet-store-filter"

export function TimesheetTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  /** 근태·시간표는 posStores (CM Office 포함). 매출용 `stores`는 오피스가 빠져 조회가 빈다. */
  const { posStores, formatStoreLabel, resolveStoreKey } = useStoreList()
  const { viewStore, setViewStore } = useStoreView()
  const isOffice = hasOfficeStaffScope(auth?.role || "", auth?.store)

  const hrStores = React.useMemo(
    () => filterHrAttendanceStorePickerOptions(posStores),
    [posStores]
  )

  const storeList = React.useMemo(() => {
    if (!auth?.store) return [] as string[]
    if (isOffice) return [TIMESHEET_ALL_STORE, ...hrStores]
    return [resolveStoreKey(auth.store) || auth.store]
  }, [auth?.store, isOffice, hrStores, resolveStoreKey])

  /**
   * 시간표 전용 선택값. 상단 매장바는 매출용이라 오피스를 All로 바꾸므로
   * 여기서 오피스·지점 조회를 유지한다.
   */
  const [pickedStore, setPickedStore] = React.useState("")
  const initedRef = React.useRef(false)

  React.useEffect(() => {
    if (!isOffice || initedRef.current) return
    if (hrStores.length === 0 && !String(viewStore || "").trim()) return
    initedRef.current = true
    const fromBar = timesheetPickedStoreFromViewStore(viewStore)
    if (fromBar !== TIMESHEET_ALL_STORE) {
      const resolved = resolveStoreKey(fromBar) || fromBar
      setPickedStore(hrStores.includes(resolved) ? resolved : fromBar)
      return
    }
    setPickedStore(TIMESHEET_ALL_STORE)
  }, [isOffice, viewStore, hrStores, resolveStoreKey])

  const storeFilter = React.useMemo(
    () =>
      resolveTimesheetQueryStore({
        authStore: auth?.store,
        isOfficeStaff: isOffice,
        pickedStore: pickedStore || TIMESHEET_ALL_STORE,
        resolveStoreKey,
      }),
    [auth?.store, isOffice, pickedStore, resolveStoreKey]
  )

  /** Select value가 옵션에 없으면 Radix가 빈 값처럼 보임 → 목록에 맞춰 보정 */
  const selectStoreValue = React.useMemo(() => {
    if (!storeFilter) return undefined
    if (storeList.includes(storeFilter)) return storeFilter
    if (storeFilter === TIMESHEET_ALL_STORE) return TIMESHEET_ALL_STORE
    const hit = storeList.find((s) => resolveStoreKey(s) === storeFilter || s === storeFilter)
    return hit || storeFilter
  }, [storeFilter, storeList, resolveStoreKey])

  const onStoreChange = React.useCallback(
    (next: string) => {
      setPickedStore(next)
      if (!isOffice) return
      // 상단 매출바는 오피스를 All로 리셋하므로 지점·전체만 동기화
      if (next === TIMESHEET_ALL_STORE || !isOfficeStore(next)) {
        setViewStore(next)
      }
    },
    [isOffice, setViewStore]
  )

  const branchStoreList = React.useMemo(
    () => storeList.filter((s) => s !== TIMESHEET_ALL_STORE),
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
          {/* 매장 검색 - 당일 실시간 근무 & 주간 시간표 공통 (오피스 포함) */}
          {storeList.length > 0 && (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
                {t("store") || "Store"}
              </label>
              <Select value={selectStoreValue} onValueChange={onStoreChange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t("scheduleStorePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {storeList.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st === TIMESHEET_ALL_STORE ? t("store_all_stores") : formatStoreLabel(st)}
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
