"use client"

import * as React from "react"
import { CrmCouponAdminPanel } from "@/components/admin/crm-coupon-admin-panel"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"

const COUPON_TABS = ["definitions", "issue", "history", "campaigns", "stamp", "promo"] as const

export default function CrmCouponsPage() {
  const [tab, setTab] = useAdminUrlTab("tab", COUPON_TABS, "definitions")
  return <CrmCouponAdminPanel initialTab={tab} onTabChange={setTab} />
}
