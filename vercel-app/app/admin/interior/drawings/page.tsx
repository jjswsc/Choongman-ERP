"use client"

import * as React from "react"
import { Suspense } from "react"
import { LayoutPanelTop } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorLayoutItemsPanel } from "@/components/interior/panels/interior-layout-items-panel"
import { InteriorFilesContent } from "@/components/interior/interior-files-content"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function DrawingsHubBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const tab = searchParams.get("tab") === "files" ? "files" : "layout"

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set("tab", v)
    router.replace(`${INTERIOR_ADMIN.drawings}?${p}`)
  }

  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.drawings}
      titleKey="interiorHubDrawings"
      icon={LayoutPanelTop}
      allowMultiProject
    >
      {(projectId) => (
        <div className="px-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full max-w-lg flex-wrap gap-1">
              <TabsTrigger value="layout">{t("interiorLayoutItems")}</TabsTrigger>
              <TabsTrigger value="files">{t("interiorFiles")}</TabsTrigger>
            </TabsList>
            <TabsContent value="layout" className="mt-4 outline-none">
              <InteriorLayoutItemsPanel projectId={projectId} />
            </TabsContent>
            <TabsContent value="files" className="mt-4 outline-none">
              <InteriorFilesContent projectId={projectId} t={t} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </InteriorProjectToolShell>
  )
}

export default function InteriorDrawingsHubPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>}>
      <DrawingsHubBody />
    </Suspense>
  )
}
