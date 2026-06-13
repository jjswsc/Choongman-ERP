"use client"

import { FileStack } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { CompanyHybridDocumentsPanel } from "@/components/erp/company-hybrid-documents/company-hybrid-documents-panel"

export default function CompanyDocumentsPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileStack className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("companyHybridDocuments")}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("companyHybridDocumentsSub")}</p>
          </div>
        </div>
        <CompanyHybridDocumentsPanel />
      </div>
    </div>
  )
}
