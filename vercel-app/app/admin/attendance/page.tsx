"use client"

import { Suspense } from "react"
import { AttendanceManageContent } from "@/components/attendance/attendance-manage-content"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function AdminAttendancePage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      }
    >
      <AttendanceManageContent />
    </Suspense>
  )
}
