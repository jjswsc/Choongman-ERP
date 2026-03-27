"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function FixedExpensesPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/bank-transactions?tab=query")
  }, [router])
  return null
}
