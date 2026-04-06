"use client"

import { Landmark } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { TaxFilingShell } from "@/components/admin/tax-filing/tax-filing-shell"

export default function TaxFilingPage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Landmark className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("adminTaxFiling")}</h1>
        </div>
        <TaxFilingShell />
      </div>
    </div>
  )
}
