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
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("orderApprovalTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("orderApprovalSub")}
            </p>
          </div>
        </div>

        <OrderApproval />
      </div>
    </div>
  )
}
