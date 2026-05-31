"use client"

import * as React from "react"
import { Download, Share, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"

const DISMISS_KEY = "member-pwa-install-dismissed"

type DeferredPrompt = { prompt: () => Promise<{ outcome: string }> }

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as { standalone?: boolean }).standalone) ||
    document.referrer.includes("android-app://")
  )
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)
}

export function MemberPwaInstallBanner() {
  const { t } = useMemberPortalLang()
  const [visible, setVisible] = React.useState(false)
  const [deferredPrompt, setDeferredPrompt] = React.useState<DeferredPrompt | null>(null)
  const [iosHint, setIosHint] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (isStandaloneMode()) return
    if (!isMobileDevice()) return
    if (sessionStorage.getItem(DISMISS_KEY)) return

    setVisible(true)
    setIosHint(isIosSafari())

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as DeferredPrompt)
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    try {
      const result = await deferredPrompt.prompt()
      if (result.outcome === "accepted") {
        sessionStorage.setItem(DISMISS_KEY, "1")
        setVisible(false)
      }
    } catch {
      /* ignore */
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1")
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="rounded-[22px] border border-amber-400/25 bg-gradient-to-br from-amber-500/10 to-white/[0.03] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-200">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{t("pwaInstallTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">{t("pwaInstallDesc")}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/45 transition hover:bg-white/5 hover:text-white/80"
          aria-label={t("pwaInstallDismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {deferredPrompt ? (
          <Button
            type="button"
            onClick={handleInstall}
            className="h-10 rounded-2xl border-0 bg-amber-400 px-4 text-sm font-semibold text-[#08080a] hover:bg-amber-300"
          >
            <Download className="mr-2 h-4 w-4" />
            {t("pwaInstallBtn")}
          </Button>
        ) : iosHint ? (
          <p className="inline-flex items-center gap-2 text-xs text-amber-100/80">
            <Share className="h-4 w-4 shrink-0" />
            {t("pwaInstallIosHint")}
          </p>
        ) : (
          <p className="text-xs text-white/50">{t("pwaInstallAndroidHint")}</p>
        )}
      </div>
    </div>
  )
}
