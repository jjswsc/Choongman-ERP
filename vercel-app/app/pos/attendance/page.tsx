"use client"

import * as React from "react"
import { Suspense } from "react"
import { useRouter } from "next/navigation"
import { AttendanceManageContent } from "@/components/attendance/attendance-manage-content"
import { useAuth } from "@/lib/auth-context"
import { canAccessPosOrder, canEditPosAttendanceManagement } from "@/lib/permissions"

function PosAttendanceBody({ readOnly }: { readOnly: boolean }) {
  return <AttendanceManageContent readOnly={readOnly} />
}

/** POS에서 근태 — staff도 조회 가능; 승인·스케줄 수정은 관리자급만 */
export default function PosAttendancePage() {
  const { auth, initialized } = useAuth()
  const router = useRouter()

  React.useEffect(() => {
    if (!initialized) return
    if (!canAccessPosOrder(auth?.role || "")) {
      router.replace("/pos")
    }
  }, [initialized, auth?.role, router])

  if (!initialized || !auth || !canAccessPosOrder(auth.role || "")) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    )
  }

  const readOnly = !canEditPosAttendanceManagement(auth.role || "", auth.store)

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-1 items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <PosAttendanceBody readOnly={readOnly} />
    </Suspense>
  )
}
