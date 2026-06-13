"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

/** 쿠폰 캠페인은 쿠폰 메뉴 「쿠폰 캠페인」탭으로 통합됨 */
export default function CrmCampaignsRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const audience = searchParams.get("audience")
    const q = new URLSearchParams({ tab: "campaigns" })
    if (audience) q.set("audience", audience)
    router.replace(`/admin/crm/coupons?${q.toString()}`)
  }, [router, searchParams])

  return null
}
