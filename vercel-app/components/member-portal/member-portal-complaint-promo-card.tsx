"use client"

import { ChevronRight, MessageSquareWarning } from "lucide-react"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"

type Props = {
  onOpen: () => void
  variant?: "full" | "compact" | "onDark"
}

export function MemberPortalComplaintPromoCard({ onOpen, variant = "full" }: Props) {
  const { t } = useMemberPortalLang()
  const compact = variant === "compact"
  const onDark = variant === "onDark"

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group w-full rounded-3xl text-left transition active:scale-[0.99] ${
        onDark
          ? "border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-orange-500/15 to-amber-600/10 p-4 shadow-lg ring-1 ring-amber-400/25 hover:from-amber-500/25"
          : `border border-amber-300/70 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.45)] ring-1 ring-amber-200/60 hover:shadow-[0_12px_28px_-8px_rgba(245,158,11,0.55)] ${compact ? "p-3.5" : "p-4"}`
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm ${
            compact ? "h-10 w-10" : "h-12 w-12"
          }`}
        >
          <MessageSquareWarning className={compact ? "h-5 w-5" : "h-6 w-6"} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`font-bold ${onDark ? "text-amber-50" : "text-amber-950"} ${
              compact ? "text-sm" : "text-base"
            }`}
          >
            {t("complaintHomePromoTitle")}
          </p>
          {!compact ? (
            <p className={`mt-1 text-xs leading-relaxed ${onDark ? "text-amber-100/80" : "text-amber-950/75"}`}>
              {t(onDark ? "complaintLoginRequired" : "complaintHomePromoSub")}
            </p>
          ) : null}
          <span
            className={`mt-2.5 inline-flex items-center gap-1 rounded-full bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm group-hover:bg-amber-700 ${
              compact ? "mt-1.5" : "mt-3"
            }`}
          >
            {t(onDark ? "loginBtn" : "complaintHomePromoBtn")}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
      </div>
    </button>
  )
}
