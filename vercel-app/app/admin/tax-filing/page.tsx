"use client"

import { Landmark } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { TaxFilingShell } from "@/components/admin/tax-filing/tax-filing-shell"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
export default function TaxFilingPage() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <AccountingPageShell icon={Landmark} title={t("adminTaxFiling")} subtitle={t("adminTaxFilingSub")}>
      <TaxFilingShell />
    </AccountingPageShell>
  )
}
