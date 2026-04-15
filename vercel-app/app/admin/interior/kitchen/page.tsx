"use client"

import * as React from "react"
import { Suspense } from "react"
import { UtensilsCrossed } from "lucide-react"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorKitchenPanel } from "@/components/interior/panels/interior-kitchen-panel"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"

function Inner() {
  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.kitchen}
      titleKey="interiorKitchen"
      icon={UtensilsCrossed}
    >
      {(projectId) => <InteriorKitchenPanel projectId={projectId} />}
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
