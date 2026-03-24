"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

/** 레거시 경로 — 마케팅 프로모션 관리로 통합 */
export default function PosPromosRedirectPage() {
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  React.useEffect(() => {
    router.replace("/admin/marketing/promos")
  }, [router])
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      {t("loading")}
    </div>
  )
}
