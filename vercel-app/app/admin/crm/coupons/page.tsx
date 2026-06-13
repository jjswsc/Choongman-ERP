"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CrmCouponAdminPanel } from "@/components/admin/crm-coupon-admin-panel"
import type { CrmCouponAdminTab } from "@/lib/crm-coupon-admin"

export default function CrmCouponsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") || "definitions"

  const onTabChange = React.useCallback(
    (next: CrmCouponAdminTab) => {
      const q = new URLSearchParams({ tab: next })
      const audience = searchParams.get("audience")
      if (next === "campaigns" && audience) q.set("audience", audience)
      router.replace(`/admin/crm/coupons?${q.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  return <CrmCouponAdminPanel initialTab={tab} onTabChange={onTabChange} />
}
