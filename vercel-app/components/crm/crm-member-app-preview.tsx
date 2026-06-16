"use client"

import * as React from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function buildMemberAppPreviewSrc(
  lang: string,
  reloadKey: number,
  loginBackgroundUrl: string,
  appBackgroundUrl: string
): string {
  const params = new URLSearchParams()
  params.set("preview", "1")
  params.set("lang", lang)
  params.set("v", String(reloadKey))
  const loginBg = String(loginBackgroundUrl || "").trim()
  const appBg = String(appBackgroundUrl || "").trim()
  if (loginBg) params.set("loginBg", loginBg)
  if (appBg) params.set("appBg", appBg)
  return `/m?${params.toString()}`
}

export function CrmMemberAppPreview({
  reloadKey = 0,
  loginBackgroundUrl = "",
  appBackgroundUrl = "",
}: {
  reloadKey?: number
  loginBackgroundUrl?: string
  appBackgroundUrl?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [iframeLoading, setIframeLoading] = React.useState(true)
  const src = React.useMemo(
    () => buildMemberAppPreviewSrc(lang, reloadKey, loginBackgroundUrl, appBackgroundUrl),
    [lang, reloadKey, loginBackgroundUrl, appBackgroundUrl]
  )

  React.useEffect(() => {
    setIframeLoading(true)
    const timer = window.setTimeout(() => setIframeLoading(false), 8000)
    return () => window.clearTimeout(timer)
  }, [src])

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
        {iframeLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#faf7f2]">
            <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
          </div>
        ) : null}
        <iframe
          title={t("crmMemberAppPreview")}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          scrolling="no"
          onLoad={() => setIframeLoading(false)}
        />
      </div>
      {appBackgroundUrl ? (
        <div className="mx-auto mt-3 max-w-[300px] space-y-1">
          <p className="text-[11px] text-muted-foreground">{t("mpAdmin_appBgUrl")}</p>
          <div
            className="h-16 w-full rounded-lg border bg-cover bg-center shadow-sm"
            style={{ backgroundImage: `url(${appBackgroundUrl})` }}
            role="img"
            aria-label={t("mpAdmin_appBgAlt")}
          />
        </div>
      ) : null}
    </div>
  )
}
