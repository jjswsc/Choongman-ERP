"use client"

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function CrmMemberAppPreview() {
  const { lang } = useLang()
  const t = useT(lang)
  const src = `/m?preview=1&lang=${encodeURIComponent(lang)}`
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
      <div className="mx-auto max-w-[280px] overflow-hidden rounded-[1.25rem] border-4 border-slate-800 bg-white shadow-lg">
        <iframe title={t("crmMemberAppPreview")} src={src} className="h-[480px] w-full border-0" />
      </div>
    </div>
  )
}
