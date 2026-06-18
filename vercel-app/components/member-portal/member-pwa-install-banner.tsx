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
    <div className="rounded-[18px] border border-orange-300 bg-gradient-to-br from-[#fff4e8] via-white to-[#ffe8d4] p-4 shadow-[0_8px_24px_rgba(242,90,19,0.15)] ring-1 ring-orange-200/80">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff9824] to-[#ef5513] text-white shadow-md">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1a1208]">{t("pwaInstallTitle")}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-[#5c4030]">{t("pwaInstallDesc")}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
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
            className="h-10 rounded-2xl border-0 bg-gradient-to-r from-[#ff9824] to-[#ef5513] px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(239,85,19,0.35)] hover:from-[#ff8f1a] hover:to-[#e64b0d]"
          >
            <Download className="mr-2 h-4 w-4" />
            {t("pwaInstallBtn")}
          </Button>
        ) : iosHint ? (
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-[#3d2818]">
            <Share className="h-4 w-4 shrink-0 text-[#ef5513]" />
            {t("pwaInstallIosHint")}
          </p>
        ) : (
          <p className="text-xs font-medium text-[#5c4030]">{t("pwaInstallAndroidHint")}</p>
        )}
      </div>
    </div>
  )
}
