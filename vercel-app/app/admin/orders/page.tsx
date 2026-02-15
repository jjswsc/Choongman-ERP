"use client"

import { OrderApproval } from "@/components/erp/order-approval"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function OrderApprovalPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {t("orderApprovalTitle") || "주문 승인 관리"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("orderApprovalSub") || "매장 주문을 검토하고 승인/거절합니다."}
          </p>
        </div>

        <OrderApproval />
      </div>
    </div>
  )
}
