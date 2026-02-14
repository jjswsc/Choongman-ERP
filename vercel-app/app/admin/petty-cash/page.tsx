"use client"

import { PettyCashTab } from "@/components/tabs/petty-cash-tab"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

export default function Page() {
  const t = useT(useLang().lang)
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("pettyCashTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("pettyTabList")} / {t("pettyTabMonthly")}</p>
        </div>
        <PettyCashTab />
      </div>
    </div>
  )
}
