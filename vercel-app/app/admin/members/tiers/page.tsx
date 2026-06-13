"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp } from "lucide-react"
import { CrmPageHero } from "@/components/crm/crm-shared-ui"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

/** 등급·적립율 관리는 포인트 메뉴 「매출 적립 규칙」탭으로 통합됨 */
export default function MemberTiersRedirectPage() {
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  useEffect(() => {
    router.replace("/admin/members/points?tab=policy")
  }, [router])
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <CrmPageHero
        icon={TrendingUp}
        title={t("memberTiers")}
        description={t("crmTiersRedirectHint")}
        gradient="from-amber-50 to-orange-50"
        border="border-amber-200/60"
        iconClass="bg-amber-500/10 text-amber-600"
      />
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    </div>
  )
}
