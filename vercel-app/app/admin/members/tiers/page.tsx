"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** 등급·적립율 관리는 포인트 메뉴 「매출 적립 규칙」탭으로 통합됨 */
export default function MemberTiersRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/members/points?tab=policy")
  }, [router])
  return null
}
