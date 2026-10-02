"use client"

import { useEffect, useState } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Smartphone, X } from "lucide-react"
import { useAppBrandConfig } from "@/components/app-brand-provider"

/** 모바일에서 홈 화면에 추가 유도. 설치되면 알림 설정에 브랜드 이름이 별도 앱으로 표시됨 */
export function PwaInstallBanner() {
  const { lang } = useLang()
  const t = useT(lang)
  const brand = useAppBrandConfig()
  const appLabel = brand.key === "omnifoodtech" ? "OmniFoodTech" : "CM ERP"
  const [visible, setVisible] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<{ outcome: string }> } | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone
      || document.referrer.includes("android-app://")
    if (isStandalone) return

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (!isMobile) return

    const dismissed = sessionStorage.getItem("pwa-install-dismissed")
    if (dismissed) return

    setVisible(true)

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as unknown as { prompt: () => Promise<{ outcome: string }> })
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        setVisible(false)
      } catch {
        //
      }
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-install-dismissed", "1")
    setVisible(false)
  }

  if (!visible) return null

  const desc = t("pwaInstallDesc").split("{app}").join(appLabel)

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
      <Smartphone className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">
          {t("pwaInstallTitle")}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {desc}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {deferredPrompt ? (
          <Button size="sm" className="h-7 text-[11px]" onClick={handleInstall}>
            {t("pwaInstallBtn")}
          </Button>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {t("pwaInstallMenuHint")}
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleDismiss} aria-label={t("pwaInstallDismiss")}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
