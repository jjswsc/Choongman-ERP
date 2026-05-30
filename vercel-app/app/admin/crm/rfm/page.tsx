"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

export default function CrmRfmPage() {
  const router = useRouter()

  React.useEffect(() => {
    router.replace("/admin/members/visits?tab=rfm")
  }, [router])

  return (
    <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
      방문 기록 화면으로 이동 중...
    </div>
  )
}
