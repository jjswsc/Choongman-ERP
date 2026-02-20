"use client"

import { ReceivablePayableTab } from "@/components/tabs/receivable-payable-tab"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { Wallet } from "lucide-react"

export default function Page() {
  const t = useT(useLang().lang)
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("receivablePayableTitle") || "미수금·미지급금 관리"}</h1>
        </div>
        <ReceivablePayableTab />
      </div>
    </div>
  )
}
