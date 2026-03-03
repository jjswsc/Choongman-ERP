"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"

export default function InteriorExpenseRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  useEffect(() => {
    if (projectId) {
      router.replace(`/admin/interior-expense?projectId=${projectId}`)
    }
  }, [projectId, router])

  return (
    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
      리다이렉트 중...
    </div>
  )
}
