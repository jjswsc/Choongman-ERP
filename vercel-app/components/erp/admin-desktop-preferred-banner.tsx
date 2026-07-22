"use client"

import { usePathname } from "next/navigation"
import { Monitor } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { isAdminDesktopPreferredPath } from "@/lib/admin-desktop-preferred-paths"
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * 무거운 표·설정 화면에서만, 좁은 화면일 때 PC 권장 안내.
 * AdminShell에 한 번만 마운트.
 */
export function AdminDesktopPreferredBanner() {
  const pathname = usePathname() || ""
  const isMobile = useIsMobile()
  const { lang } = useLang()
  const t = useT(lang)

  if (!isMobile || !isAdminDesktopPreferredPath(pathname)) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100 md:hidden print:hidden"
    >
      <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      <p className="min-w-0 leading-snug">
        {tOr(
          t,
          "adminDesktopPreferredBanner",
          "이 화면은 PC에서 보시는 것이 편합니다. 폰에서는 표를 좌우로 밀어 확인하세요."
        )}
      </p>
    </div>
  )
}
