"use client"

import { RealtimeWork } from "@/components/erp/realtime-work"
import { WeeklySchedule } from "@/components/erp/weekly-schedule"
import { MyAttendance } from "@/components/erp/my-attendance"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function TimesheetTab() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-lg">
        {/* Page header */}
        <div className="sticky top-0 z-20 border-b bg-card/80 px-4 py-3 backdrop-blur-lg">
          <h1 className="text-base font-bold text-card-foreground">{t("tabTimesheet")}</h1>
          <p className="text-[11px] text-muted-foreground">
            {t("scheduleToday")}, {t("scheduleWeek")}, {t("scheduleMyPunch")}
          </p>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 p-4">
          <RealtimeWork />
          <WeeklySchedule />
          <MyAttendance />
        </div>
      </div>
    </div>
  )
}
