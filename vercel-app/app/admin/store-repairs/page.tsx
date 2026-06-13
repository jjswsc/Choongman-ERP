"use client"

import { Suspense } from "react"
import { AdminStoreRepairs } from "@/components/admin/admin-store-repairs"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminStoreRepairs />
    </Suspense>
  )
}
