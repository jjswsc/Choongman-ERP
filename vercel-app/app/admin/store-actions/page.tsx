"use client"

import { Suspense } from "react"
import { AdminStoreActions } from "@/components/admin/admin-store-actions"

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AdminStoreActions />
    </Suspense>
  )
}
