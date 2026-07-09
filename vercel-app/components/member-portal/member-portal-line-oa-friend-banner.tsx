"use client"

import * as React from "react"
import { Bell, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
} from "@/lib/member-portal-design"

const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

function dismissStorageKey(memberId: number): string {
  return `member-line-oa-banner-dismissed-${memberId}`
}

function isBannerDismissed(memberId: number): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = localStorage.getItem(dismissStorageKey(memberId))
    if (!raw) return false
    const ts = Number(raw)
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_MS
  } catch {
    return false
  }
}

function dismissBanner(memberId: number): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(dismissStorageKey(memberId), String(Date.now()))
  } catch {
    /* ignore */
  }
}

export function MemberPortalLineOaFriendBanner({
  memberId,
  lineOaFriend,
  lineOfficialUrl,
}: {
  memberId: number
  lineOaFriend?: boolean
  lineOfficialUrl: string
}) {
  const { t } = useMemberPortalLang()
  const [dismissed, setDismissed] = React.useState(false)

  const oaUrl = String(lineOfficialUrl || "").trim()
  const id = Number(memberId || 0)

  React.useEffect(() => {
    if (!id) return
    setDismissed(isBannerDismissed(id))
  }, [id])

  if (!id || lineOaFriend || !oaUrl || dismissed) return null

  return (
    <div className="rounded-[18px] border border-[#06C755]/35 bg-gradient-to-br from-[#e8fbeb] via-white to-[#f0fdf4] p-4 shadow-[0_8px_24px_rgba(6,199,85,0.12)] ring-1 ring-[#06C755]/15">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] text-white shadow-md">
          <Bell className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${MP_CARD_TEXT_PRIMARY}`}>{t("lineOaFriendBannerTitle")}</p>
          <p className={`mt-1 text-xs font-medium leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>
            {t("lineOaFriendBannerSub")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissBanner(id)
            setDismissed(true)
          }}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
          aria-label={t("lineOaFriendBannerDismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Button
        type="button"
        className="mt-3 h-11 w-full rounded-2xl border-0 bg-[#06C755] text-sm font-semibold text-white shadow-[0_6px_18px_rgba(6,199,85,0.28)] hover:bg-[#05b34c]"
        onClick={() => {
          window.open(oaUrl, "_blank", "noopener,noreferrer")
        }}
      >
        {t("lineOaFriendBannerBtn")}
      </Button>
    </div>
  )
}
