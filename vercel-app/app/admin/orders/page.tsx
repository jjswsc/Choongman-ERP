"use client"

import { ShoppingCart } from "lucide-react"
import { OrderApproval } from "@/components/erp/order-approval"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function OrderApprovalPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page Title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("orderApprovalTitle") || "주문 승인 관리"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("orderApprovalSub") || "매장 주문을 검토하고 승인/거절합니다."}
            </p>
          </div>
        </div>

        <OrderApproval />
      </div>
    </div>
  )
}
