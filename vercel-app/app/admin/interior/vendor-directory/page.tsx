"use client"

import { Suspense } from "react"
import { InteriorVendorDirectoryPanel } from "@/components/interior/panels/interior-vendor-directory-panel"

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          …
        </div>
      }
    >
      <InteriorVendorDirectoryPanel />
    </Suspense>
  )
}
