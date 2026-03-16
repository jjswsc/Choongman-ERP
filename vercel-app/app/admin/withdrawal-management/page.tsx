"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** 출금 관리는 지출 관리 > 지출 등록 탭으로 통합됨. 기존 URL 북마크용 리다이렉트 */
export default function WithdrawalManagementPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/expense-management?tab=expenseRegister")
  }, [router])
  return null
}
