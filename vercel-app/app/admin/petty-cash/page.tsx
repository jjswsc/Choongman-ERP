"use client"

import { Banknote } from "lucide-react"
import { PettyCashTab } from "@/components/tabs/petty-cash-tab"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

export default function Page() {
  const t = useT(useLang().lang)
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Banknote className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("pettyCashTitle")}</h1>
            <p className="text-xs text-muted-foreground">{t("pettyTabList")} / {t("pettyTabMonthly")}</p>
          </div>
        </div>
        <PettyCashTab />
      </div>
    </div>
  )
}
