"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** 기존 테이블 배치 페이지 → POS 화면 구성 > 테이블 구성 탭으로 리다이렉트 */
export default function PosTablesPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/pos-screen-config?tab=tables")
  }, [router])
  return (
    <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
      리다이렉트 중...
    </div>
  )
}
