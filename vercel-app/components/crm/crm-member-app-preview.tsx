"use client"

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function CrmMemberAppPreview({ reloadKey = 0 }: { reloadKey?: number }) {
  const { lang } = useLang()
  const t = useT(lang)
  const src = `/m?preview=1&lang=${encodeURIComponent(lang)}&v=${reloadKey}`
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{t("crmMemberAppPreview")}</p>
          <p className="text-xs text-muted-foreground">{t("crmMemberAppPreviewHint")}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/m" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            /m
          </a>
        </Button>
      </div>
      <div
        className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-stone-800 bg-[#faf7f2] shadow-xl"
        style={{ aspectRatio: "390 / 844", maxHeight: "min(72vh, 640px)" }}
      >
        <iframe
          key={reloadKey}
          title={t("crmMemberAppPreview")}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          scrolling="no"
        />
      </div>
    </div>
  )
}
