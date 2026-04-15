"use client"

import * as React from "react"
import { Suspense } from "react"
import { PackageSearch } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorMaterialsPanel } from "@/components/interior/panels/interior-materials-panel"
import { InteriorSpecificationPanel } from "@/components/interior/panels/interior-specification-panel"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function SpecsHubBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const tab = searchParams.get("tab") === "spec" ? "spec" : "materials"

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", v)
    router.replace(`${INTERIOR_ADMIN.specs}?${p}`)
  }

  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.specs}
      titleKey="interiorHubSpecs"
      icon={PackageSearch}
    >
      {(projectId) => (
        <div className="px-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full max-w-lg flex-wrap gap-1">
              <TabsTrigger value="materials">{t("interiorMaterialSpecs")}</TabsTrigger>
              <TabsTrigger value="spec">{t("interiorSpecification")}</TabsTrigger>
            </TabsList>
            <TabsContent value="materials" className="mt-4 outline-none">
              <InteriorMaterialsPanel projectId={projectId} />
            </TabsContent>
            <TabsContent value="spec" className="mt-4 outline-none">
              <InteriorSpecificationPanel projectId={projectId} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </InteriorProjectToolShell>
  )
}

export default function InteriorSpecsHubPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>}>
      <SpecsHubBody />
    </Suspense>
  )
}
