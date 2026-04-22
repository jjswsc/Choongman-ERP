"use client"

import * as React from "react"
import { Suspense } from "react"
import { HandCoins } from "lucide-react"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorVendorsPanel } from "@/components/interior/panels/interior-vendors-panel"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"

function Inner() {
  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.vendors}
      titleKey="interiorVendorTracks"
      icon={HandCoins}
      allowMultiProject
    >
      {(projectId) => <InteriorVendorsPanel projectId={projectId} />}
    </InteriorProjectToolShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>}>
      <Inner />
    </Suspense>
  )
}
