"use client"

import * as React from "react"
import { Gift, History, X } from "lucide-react"
import { createPortal } from "react-dom"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import {
  MP_CARD_TEXT_MUTED,
  MP_CARD_TEXT_SECONDARY,
  MP_CARD_TEXT_SUBTLE,
} from "@/lib/member-portal-design"
import {
  MP_HOME_STAMP_CARD_RADIUS,
  MP_HOME_STAMP_FOOD_H,
  MP_HOME_STAMP_FOOD_W,
  MP_HOME_STAMP_SLOT_SIZE,
} from "@/lib/member-portal-home-layout"
import type { LangCode } from "@/lib/lang-context"
import { memberPortalT } from "@/lib/member-portal-i18n"
import type { MemberStampCardStatus, MemberStampHistoryRow } from "@/lib/member-stamp-card"
import { DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL } from "@/lib/member-portal-stamp-food-image"

const STAMP_CROWN = "♕"

const STAMP_SEEN_KEY = "cm_stamp_seen_fingerprint"

function stampFingerprint(status: MemberStampCardStatus): string {
  return `${status.cardSequence}:${status.currentStamps}:${status.totalEarned}`
}

function readSeenFingerprint(memberId: number): string {
  if (typeof window === "undefined") return ""
  try {
    return localStorage.getItem(`${STAMP_SEEN_KEY}_${memberId}`) || ""
  } catch {
    return ""
  }
}

function writeSeenFingerprint(memberId: number, fp: string) {
  try {
    localStorage.setItem(`${STAMP_SEEN_KEY}_${memberId}`, fp)
  } catch {
    /* ignore */
  }
}

type CelebrationState = {
  title: string
  lines: string[]
}

function StampCelebrationSheet({
  open,
  onClose,
  celebration,
  couponsCta,
  onGoCoupons,
}: {
  open: boolean
  onClose: () => void
  celebration: CelebrationState | null
  couponsCta: string
  onGoCoupons: () => void
}) {
  if (!open || !celebration || typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-[28px] border border-amber-300/30 bg-gradient-to-b from-[#2a2218] to-[#14110d] p-6 shadow-2xl duration-300">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-200">
            <Gift className="h-6 w-6" aria-hidden />
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/50 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h3 className="text-xl font-semibold text-white">{celebration.title}</h3>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-amber-100/85">
          {celebration.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onGoCoupons}
            className="h-11 flex-1 rounded-2xl bg-amber-400/90 text-sm font-semibold text-black"
          >
            {couponsCta}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl border border-white/15 px-4 text-sm text-white/80"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function resolveStampHomeTitle(lang: LangCode, status: MemberStampCardStatus): string {
  const t = (key: Parameters<typeof memberPortalT>[1]) => memberPortalT(lang, key)
  if (status.lastCompletion && status.currentStamps === 0) {
    return t("stampNewCardTitle")
  }
  return t("stampHomeTitle")
}

function resolveStampHomeSubtitle(
  lang: LangCode,
  status: MemberStampCardStatus
): string {
  const t = (key: Parameters<typeof memberPortalT>[1]) => memberPortalT(lang, key)
  const slots = Math.max(1, status.cardSlots)
  const finalMilestone = status.milestones[status.milestones.length - 1]
  const reward =
    status.nextMilestone?.label ||
    finalMilestone?.label ||
    t("stampCardDesc")

  if (finalMilestone?.label || status.nextMilestone?.label) {
    return t("stampHomeSubtitle")
      .replace("{total}", String(slots))
      .replace("{reward}", reward)
  }
  return t("stampCardDesc")
}

function formatStampHistoryKind(
  lang: LangCode,
  row: MemberStampHistoryRow
): string {
  const t = (key: Parameters<typeof memberPortalT>[1]) => memberPortalT(lang, key)
  if (row.kind === "earn") return "+1"
  if (row.kind === "revoke") return t("stampHistoryRevoke")
  if (row.kind === "adjust") return t("stampHistoryAdjust")
  if (row.kind === "reset") {
    return row.note?.startsWith("card_expired")
      ? t("stampHistoryExpired")
      : t("stampHistoryReset")
  }
  return row.kind
}

function StampHomeShell({
  children,
  onClick,
  foodImageUrl,
}: {
  children: React.ReactNode
  onClick?: () => void
  foodImageUrl: string
}) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`relative w-full overflow-hidden text-left ${MP_HOME_STAMP_CARD_RADIUS} bg-gradient-to-r from-[#f2faeb] to-[#fff8eb] py-[13px] pl-[15px] pr-[125px] shadow-[0_6px_16px_rgba(54,30,7,0.05)] transition-transform duration-200 ${
        onClick ? "hover:brightness-[1.01] active:scale-[0.995]" : ""
      }`}
      style={{ minHeight: 112 }}
    >
      {children}
      <div
        className={`pointer-events-none absolute bottom-[10px] right-4 ${MP_HOME_STAMP_FOOD_W} ${MP_HOME_STAMP_FOOD_H}`}
        aria-hidden
      >
        <img
          src={foodImageUrl}
          alt=""
          className="h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(108,54,12,0.18)]"
        />
      </div>
    </Tag>
  )
}

function StampHomeSlots({
  slots,
  filled,
  animateLast,
}: {
  slots: number
  filled: number
  animateLast?: boolean
}) {
  return (
    <div className="my-[9px] flex flex-wrap gap-1">
      {Array.from({ length: slots }, (_, i) => {
        const isFilled = i < filled
        const pop = Boolean(animateLast && isFilled && i === filled - 1)
        return (
          <span
            key={i}
            className={`grid ${MP_HOME_STAMP_SLOT_SIZE} shrink-0 place-items-center rounded-full text-[10px] font-black leading-none transition ${
              isFilled ? "bg-[#ffc27a] text-white" : "bg-[#dce3d3] text-[#a9b19f]"
            } ${pop ? "scale-110 animate-pulse" : ""}`}
          >
            {STAMP_CROWN}
          </span>
        )
      })}
    </div>
  )
}

function MemberPortalStampPreparingPlaceholder({
  lang,
  foodImageUrl = DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL,
}: {
  lang: LangCode
  foodImageUrl?: string
}) {
  const t = (key: Parameters<typeof memberPortalT>[1]) => memberPortalT(lang, key)

  return (
    <StampHomeShell foodImageUrl={foodImageUrl}>
      <h3 className="m-0 text-[13px] font-black leading-[1.2] text-[#161616]">{t("stampPreparingTitle")}</h3>
      <p className="m-0 text-[10.5px] font-extrabold leading-[1.35] text-[#161616]">{t("stampPreparingDesc")}</p>
      <StampHomeSlots slots={10} filled={0} />
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-extrabold text-[#4b8a31]">
          {t("stampHomeCount").replace("{current}", "0").replace("{total}", "10")}
        </span>
        <span className="rounded-full bg-gradient-to-r from-[#75b74d] to-[#578f3c] px-[13px] py-1 text-[8px] font-extrabold text-white">
          {t("stampViewCard")}
        </span>
      </div>
    </StampHomeShell>
  )
}

export function MemberPortalStampHomeWidget({
  lang,
  status,
  loading,
  foodImageUrl = DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL,
  onOpenPrivilege,
}: {
  lang: LangCode
  status: MemberStampCardStatus | null
  loading?: boolean
  foodImageUrl?: string
  onOpenPrivilege: () => void
}) {
  const t = (key: Parameters<typeof memberPortalT>[1]) => memberPortalT(lang, key)
  if (loading) return null
  if (!status) return null
  if (status.preparing) {
    return <MemberPortalStampPreparingPlaceholder lang={lang} foodImageUrl={foodImageUrl} />
  }
  if (!status.enabled) return null
  const slots = Math.max(1, status.cardSlots)
  const filled = status.currentStamps

  return (
    <StampHomeShell onClick={onOpenPrivilege} foodImageUrl={foodImageUrl}>
      <h3 className="m-0 text-[13px] font-black leading-[1.2] text-[#161616]">
        {resolveStampHomeTitle(lang, status)}
      </h3>
      <p className="m-0 text-[10.5px] font-extrabold leading-[1.35] text-[#161616]">
        {resolveStampHomeSubtitle(lang, status)}
      </p>
      <StampHomeSlots slots={slots} filled={filled} />
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-extrabold text-[#4b8a31]">
          {t("stampHomeCount").replace("{current}", String(filled)).replace("{total}", String(slots))}
        </span>
        <span className="rounded-full bg-gradient-to-r from-[#75b74d] to-[#578f3c] px-[13px] py-1 text-[8px] font-extrabold text-white shadow-sm">
          {t("stampViewCard")}
        </span>
      </div>
    </StampHomeShell>
  )
}

type Props = {
  lang: LangCode
  memberId: number
  status: MemberStampCardStatus | null
  loading?: boolean
  compact?: boolean
  foodImageUrl?: string
  onGoCoupons?: () => void
}

export function MemberPortalStampCard({
  lang,
  memberId,
  status,
  loading,
  compact,
  foodImageUrl = DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL,
  onGoCoupons,
}: Props) {
  const t = (key: Parameters<typeof memberPortalT>[1]) => memberPortalT(lang, key)
  const [history, setHistory] = React.useState<MemberStampHistoryRow[]>([])
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [celebration, setCelebration] = React.useState<CelebrationState | null>(null)
  const [celebrationOpen, setCelebrationOpen] = React.useState(false)
  const [animateSlots, setAnimateSlots] = React.useState(false)
  const prevFilledRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!memberId || !status?.enabled) return
    void fetch("/api/member-portal/me/stamps/history?limit=10", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((d: { rows?: MemberStampHistoryRow[] }) => setHistory(d.rows || []))
      .catch(() => setHistory([]))
  }, [memberId, status?.enabled, status?.currentStamps])

  React.useEffect(() => {
    if (!status?.enabled || !memberId) return
    const fp = stampFingerprint(status)
    const seen = readSeenFingerprint(memberId)
    if (seen && seen !== fp) {
      const lines: string[] = []
      let title = t("stampCelebrateEarn")

      if (status.lastCompletion?.reason === "expired") {
        title = t("stampCelebrateExpired")
        lines.push(
          t("stampCompleteBanner").replace("{n}", String(status.lastCompletion.completedCardSequence))
        )
      } else if (status.lastCompletion?.reason === "complete") {
        title = t("stampCelebrateComplete")
        lines.push(
          t("stampCompleteBanner").replace("{n}", String(status.lastCompletion.completedCardSequence))
        )
        const rewardBits: string[] = [...status.lastCompletion.rewards]
        if (status.lastCompletion.pointsAwarded > 0) {
          rewardBits.push(`${status.lastCompletion.pointsAwarded}P`)
        }
        if (rewardBits.length) {
          lines.push(t("stampCompleteRewardHint").replace("{rewards}", rewardBits.join(", ")))
        }
      } else {
        if (status.nextMilestone && status.currentStamps >= 1) {
          lines.push(
            t("stampProgress")
              .replace("{current}", String(status.currentStamps))
              .replace("{total}", String(status.cardSlots))
          )
        }
        const achieved = status.milestones.filter((m) => m.achieved)
        const latest = achieved[achieved.length - 1]
        if (latest) {
          title = t("stampCelebrateMilestone")
          lines.push(
            t("stampMilestoneAchieved")
              .replace("{count}", String(latest.stampCount))
              .replace("{label}", latest.label)
          )
        }
      }

      if (lines.length) {
        setCelebration({ title, lines })
        setCelebrationOpen(true)
      }
      setAnimateSlots(true)
      window.setTimeout(() => setAnimateSlots(false), 900)
    }
    writeSeenFingerprint(memberId, fp)
    if (prevFilledRef.current != null && status.currentStamps > prevFilledRef.current) {
      setAnimateSlots(true)
      window.setTimeout(() => setAnimateSlots(false), 900)
    }
    prevFilledRef.current = status.currentStamps
  }, [status, memberId, t])

  if (loading) return null

  if (!status) return null

  if (status.preparing) {
    return <MemberPortalStampPreparingPlaceholder lang={lang} foodImageUrl={foodImageUrl} />
  }

  if (!status.enabled) return null

  const slots = Math.max(1, status.cardSlots)
  const filled = Math.max(0, Math.min(slots, status.currentStamps))

  return (
    <>
      <div className="space-y-3">
        <StampHomeShell foodImageUrl={foodImageUrl}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="m-0 text-[13px] font-black leading-[1.2] text-[#161616]">
                {resolveStampHomeTitle(lang, status)}
              </h3>
              <p className="m-0 text-[10.5px] font-extrabold leading-[1.35] text-[#161616]">
                {resolveStampHomeSubtitle(lang, status)}
              </p>
            </div>
            {!compact ? (
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-stone-200/90 bg-white/80 px-2.5 py-1 text-[10px] font-semibold ${MP_CARD_TEXT_SECONDARY}`}
              >
                <History className="h-3 w-3" />
                {t("stampHistoryBtn")}
              </button>
            ) : null}
          </div>
          <StampHomeSlots slots={slots} filled={filled} animateLast={animateSlots} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-[10px] font-extrabold text-[#4b8a31]">
              {t("stampHomeCount").replace("{current}", String(filled)).replace("{total}", String(slots))}
            </span>
            {status.totalEarned > 0 ? (
              <span className={`text-[10px] ${MP_CARD_TEXT_SUBTLE}`}>
                {t("stampTotalEarned").replace("{count}", String(status.totalEarned))}
              </span>
            ) : null}
            {status.cardExpiresAt ? (
              <span className="text-[10px] text-amber-800/75">
                {t("stampExpiresAt").replace("{date}", status.cardExpiresAt)}
              </span>
            ) : null}
            {status.cardSequence > 1 ? (
              <span className={`text-[10px] ${MP_CARD_TEXT_SUBTLE}`}>
                {t("stampCardSequence").replace("{n}", String(status.cardSequence))}
              </span>
            ) : null}
          </div>
        </StampHomeShell>

        {status.lastCompletion ? (
          <p className={`rounded-[17px] border border-amber-200/90 bg-gradient-to-r from-[#fff8eb] to-[#f2faeb] px-4 py-3 text-[11px] font-semibold leading-relaxed text-[#5c3d12] ${MP_HOME_STAMP_CARD_RADIUS}`}>
            {status.lastCompletion.reason === "expired"
              ? t("stampCelebrateExpired")
              : t("stampCompleteBanner").replace("{n}", String(status.lastCompletion.completedCardSequence))}
            {status.lastCompletion.reason === "complete" &&
            (status.lastCompletion.rewards.length > 0 || status.lastCompletion.pointsAwarded > 0) ? (
              <>
                {" "}
                {t("stampCompleteRewardHint").replace(
                  "{rewards}",
                  [
                    ...status.lastCompletion.rewards,
                    status.lastCompletion.pointsAwarded > 0
                      ? `${status.lastCompletion.pointsAwarded}P`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(", ")
                )}
              </>
            ) : null}
          </p>
        ) : status.resetAfterComplete ? (
          <p className={`px-1 text-[10px] leading-relaxed ${MP_CARD_TEXT_SUBTLE}`}>{t("stampResetHint")}</p>
        ) : null}

        {status.nextMilestone ? (
          <p className={`rounded-[17px] border border-emerald-200/80 bg-gradient-to-r from-[#f2faeb] to-[#fff8eb] px-4 py-3 text-[11px] font-semibold leading-relaxed text-[#2d5016] ${MP_HOME_STAMP_CARD_RADIUS}`}>
            {t("stampNextReward")
              .replace("{remaining}", String(status.nextMilestone.stampsRemaining))
              .replace("{label}", status.nextMilestone.label || status.nextMilestone.couponCode)}
          </p>
        ) : null}

        {historyOpen && history.length > 0 ? (
          <GlassCard soft className="px-4 py-3">
            <p className={`mb-2 text-xs font-semibold ${MP_CARD_TEXT_SECONDARY}`}>{t("stampHistoryTitle")}</p>
            <div className="space-y-2">
              {history.slice(0, 8).map((row) => (
                <div key={row.id} className={`flex items-center justify-between gap-2 text-xs ${MP_CARD_TEXT_MUTED}`}>
                  <span>
                    {row.stampYmd}
                    {row.storeCode ? ` · ${row.storeCode}` : ""}
                  </span>
                  <span className={row.kind === "earn" ? "font-medium text-emerald-700" : MP_CARD_TEXT_SUBTLE}>
                    {formatStampHistoryKind(lang, row)}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : null}
      </div>

      <StampCelebrationSheet
        open={celebrationOpen}
        onClose={() => setCelebrationOpen(false)}
        celebration={celebration}
        couponsCta={t("stampViewCoupons")}
        onGoCoupons={() => {
          setCelebrationOpen(false)
          onGoCoupons?.()
        }}
      />
    </>
  )
}

export function useMemberPortalStampStatus(lang: LangCode, enabled: boolean) {
  const [status, setStatus] = React.useState<MemberStampCardStatus | null>(null)
  const [loading, setLoading] = React.useState(false)

  const reload = React.useCallback(async () => {
    if (!enabled) {
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/member-portal/me/stamps?lang=${encodeURIComponent(lang)}`, {
        credentials: "same-origin",
        cache: "no-store",
      })
      const data = (await res.json()) as { success?: boolean; status?: MemberStampCardStatus | null }
      setStatus(data.success ? data.status ?? null : null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [enabled, lang])

  React.useEffect(() => {
    void reload()
  }, [reload])

  return { status, loading, reload }
}
