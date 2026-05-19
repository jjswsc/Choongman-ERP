"use client"

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { HandCoins } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorVendorsPanel } from "@/components/interior/panels/interior-vendors-panel"
import { InteriorVendorDirectoryPanel } from "@/components/interior/panels/interior-vendor-directory-panel"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export type InteriorVendorHubTab = "directory" | "tracks"

function parseVendorHubTab(raw: string | null): InteriorVendorHubTab {
  return raw === "directory" ? "directory" : "tracks"
}

function VendorsHubBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const tab = parseVendorHubTab(searchParams.get("tab"))

  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams.toString())
    next.set("tab", value === "directory" ? "directory" : "tracks")
    router.replace(`${INTERIOR_ADMIN.vendors}?${next}`)
  }

  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.vendors}
      titleKey="interiorVendorsHub"
      icon={HandCoins}
      allowMultiProject
    >
      {(projectId) => (
        <div className="px-1 pb-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 flex h-auto w-full max-w-md flex-wrap gap-1">
              <TabsTrigger value="directory">{t("interiorVendorDirectory")}</TabsTrigger>
              <TabsTrigger value="tracks">{t("interiorVendorTracks")}</TabsTrigger>
            </TabsList>
            <TabsContent value="directory" className="mt-0 outline-none">
              <InteriorVendorDirectoryPanel embedded />
            </TabsContent>
            <TabsContent value="tracks" className="mt-0 outline-none">
              <InteriorVendorsPanel projectId={projectId} embedded />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </InteriorProjectToolShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>}>
      <VendorsHubBody />
    </Suspense>
  )
}
