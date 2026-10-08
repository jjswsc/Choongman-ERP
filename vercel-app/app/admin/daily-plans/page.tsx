"use client"

import { Suspense } from "react"
import { AdminDailyPlans } from "@/components/admin/admin-daily-plans"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminDailyPlans />
    </Suspense>
  )
}
