'use client'

import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { PosSettlementForm } from "@/components/pos/pos-settlement-form"

export default function AdminPosSettlementPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <PosSettlementForm t={t} />
      </div>
    </div>
  )
}

