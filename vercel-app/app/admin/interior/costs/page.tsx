"use client"

import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { Wallet } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorExpenseContent } from "@/components/interior/interior-expense-content"
import { InteriorRecentProjectFiles } from "@/components/interior/interior-recent-project-files"
import { INTERIOR_ADMIN, withInteriorProjectId } from "@/lib/interior-admin-nav"
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
              <div className="mx-auto max-w-2xl space-y-6 rounded-lg border bg-muted/20 p-6">
                <p className="text-sm text-muted-foreground leading-relaxed">{t("interiorCostsQuotesHint")}</p>
                <InteriorRecentProjectFiles
                  projectId={String(projectId)}
                  t={t}
                  viewAllHref={withInteriorProjectId(INTERIOR_ADMIN.drawings, projectId, "files")}
                />
                <Button asChild variant="secondary" className="w-full sm:w-auto">
                  <Link href={withInteriorProjectId(INTERIOR_ADMIN.drawings, projectId, "files")}>
                    {t("interiorFiles")}
                  </Link>
                </Button>
              </div>
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
