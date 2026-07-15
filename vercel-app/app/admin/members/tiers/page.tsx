"use client"

import { TrendingUp } from "lucide-react"
import { CrmPageHero } from "@/components/crm/crm-shared-ui"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { MemberPointsPolicyTab } from "@/components/admin/member-points-policy-tab"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function MemberTiersPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <CrmPageHero
          icon={TrendingUp}
          title={t("memberTiers")}
          description={
            t("memberTiersPageSub") ||
            "회원 등급 기준·혜택·승급 조건과 POS 매출 연동 적립 규칙을 관리합니다."
          }
          gradient="from-amber-50 via-orange-50 to-yellow-50/80"
          border="border-amber-200/70"
          iconClass="bg-amber-500/15 text-amber-700"
        />
        <CrmSubnav />
        <div className="mt-5">
          <MemberPointsPolicyTab />
        </div>
      </div>
    </div>
  )
}
