"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"

/** 포인트 메뉴는 회원 관리(`/admin/members`)로 통합됨. 북마크·구 URL 호환용 리다이렉트. */
export default function MemberPointsRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  React.useEffect(() => {
    const qs = new URLSearchParams()
    qs.set("tab", "points")
    const memberId = searchParams.get("memberId")
    if (memberId) qs.set("memberId", memberId)
    // 기존 policy 탭 → 등급 화면
    if (searchParams.get("tab") === "policy") {
      router.replace("/admin/members/tiers")
      return
    }
    router.replace(`/admin/members?${qs.toString()}`)
  }, [router, searchParams])

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
      Redirecting…
    </div>
  )
}
