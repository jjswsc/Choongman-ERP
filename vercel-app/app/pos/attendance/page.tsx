"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AttendanceManageContent } from "@/components/attendance/attendance-manage-content"
import { useAuth } from "@/lib/auth-context"
import { canAccessAdmin } from "@/lib/permissions"

/** POS에서 근태 관리 — 관리자 `/admin/attendance`와 동일 화면·API (세션·DB 동일 연동) */
export default function PosAttendancePage() {
  const { auth, initialized } = useAuth()
  const router = useRouter()

  React.useEffect(() => {
    if (!initialized) return
    if (!canAccessAdmin(auth?.role || "")) {
      router.replace("/pos")
    }
  }, [initialized, auth?.role, router])

  if (!initialized || !auth || !canAccessAdmin(auth.role || "")) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  return <AttendanceManageContent />
}
