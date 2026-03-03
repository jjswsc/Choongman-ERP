"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function MarketingPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/admin/marketing/campaigns")
  }, [router])
  return null
}
