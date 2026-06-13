"use client"

import { Suspense } from "react"
import { Wallet } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorExpenseContent } from "@/components/interior/interior-expense-content"
import { InteriorQuotesPanel } from "@/components/interior/interior-quotes-panel"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function CostsHubBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const tab = searchParams.get("tab") === "quotes" ? "quotes" : "expense"

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", v)
    router.replace(`${INTERIOR_ADMIN.costs}?${p}`)
  }

  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.costs}
      titleKey="interiorHubCosts"
      icon={Wallet}
      allowMultiProject
    >
      {(projectId) => (
        <div className="px-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full max-w-lg flex-wrap gap-1">
              <TabsTrigger value="expense">{t("interiorExpense")}</TabsTrigger>
              <TabsTrigger value="quotes">{t("interiorTabQuotesDocs")}</TabsTrigger>
            </TabsList>
            <TabsContent value="expense" className="mt-4 outline-none">
              <InteriorExpenseContent projectId={projectId} t={t} />
            </TabsContent>
            <TabsContent value="quotes" className="mt-4 outline-none">
              <InteriorQuotesPanel projectId={String(projectId)} t={t} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </InteriorProjectToolShell>
  )
}

export default function InteriorCostsHubPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>}>
      <CostsHubBody />
    </Suspense>
  )
}
