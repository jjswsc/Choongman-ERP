"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"
import { cn } from "@/lib/utils"

type TabId = "directory" | "tracks"

export function InteriorVendorSectionTabs({ active }: { active: TabId }) {
  const t = useT(useLang().lang)
  const searchParams = useSearchParams()
  const projectId = searchParams.get("projectId")?.trim() ?? ""
  const tabPreserve = searchParams.get("tab")?.trim() ?? ""

  const qs = () => {
    const p = new URLSearchParams()
    if (projectId) p.set("projectId", projectId)
    if (tabPreserve) p.set("tab", tabPreserve)
    const q = p.toString()
    return q ? `?${q}` : ""
  }

  const tabs: { id: TabId; href: string; labelKey: string }[] = [
    { id: "directory", href: `${INTERIOR_ADMIN.vendorDirectory}${qs()}`, labelKey: "interiorVendorDirectory" },
    { id: "tracks", href: `${INTERIOR_ADMIN.vendors}${qs()}`, labelKey: "interiorVendorTracks" },
  ]

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            active === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </div>
  )
}
