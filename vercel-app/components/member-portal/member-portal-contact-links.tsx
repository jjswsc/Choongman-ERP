"use client"

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { GlassCard, SectionTitle } from "@/components/member-portal/member-portal-premium-ui"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"

export type MemberPortalContactUrls = {
  facebookUrl: string
  instagramUrl: string
  lineOfficialUrl: string
}

export function hasMemberPortalContactLinks(urls: MemberPortalContactUrls): boolean {
  return Boolean(
    String(urls.facebookUrl || "").trim() ||
      String(urls.instagramUrl || "").trim() ||
      String(urls.lineOfficialUrl || "").trim()
  )
}

function openExternalUrl(url: string) {
  const target = String(url || "").trim()
  if (!target) return
  window.open(target, "_blank", "noopener,noreferrer")
}

function LineLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? "h-5 w-5"} aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#06C755" />
      <path
        d="M14 24.8C14 17.73 19.73 12 26.8 12h10.4C44.27 12 50 17.73 50 24.8c0 6.63-5.06 12.07-11.52 12.69l-4.77 6.1a1.4 1.4 0 0 1-2.5-.86v-5.15H26.8C19.73 37.58 14 31.87 14 24.8Z"
        fill="#fff"
      />
    </svg>
  )
}

type ChannelButtonProps = {
  label: string
  onClick: () => void
  className: string
  icon?: React.ReactNode
}

function ChannelButton({ label, onClick, className, icon }: ChannelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 ${className}`}
    >
      <span className="inline-flex items-center gap-2.5">
        {icon}
        {label}
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
    </button>
  )
}

export function MemberPortalContactChannelButtons({
  urls,
  onChannelClick,
}: {
  urls: MemberPortalContactUrls
  onChannelClick?: () => void
}) {
  const { t } = useMemberPortalLang()
  const facebookUrl = String(urls.facebookUrl || "").trim()
  const instagramUrl = String(urls.instagramUrl || "").trim()
  const lineOfficialUrl = String(urls.lineOfficialUrl || "").trim()

  if (!hasMemberPortalContactLinks(urls)) return null

  const open = (url: string) => {
    openExternalUrl(url)
    onChannelClick?.()
  }

  return (
    <div className="space-y-2.5">
      {facebookUrl ? (
        <ChannelButton
          label={t("contactViaFacebook")}
          onClick={() => open(facebookUrl)}
          className="bg-[#1877F2]"
        />
      ) : null}
      {instagramUrl ? (
        <ChannelButton
          label={t("contactViaInstagram")}
          onClick={() => open(instagramUrl)}
          className="bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737]"
        />
      ) : null}
      {lineOfficialUrl ? (
        <ChannelButton
          label={t("contactViaLineOfficial")}
          onClick={() => open(lineOfficialUrl)}
          className="bg-[#06C755] text-white"
          icon={<LineLogo className="h-5 w-5 shrink-0" />}
        />
      ) : null}
    </div>
  )
}

export function MemberPortalProfileContactLinks({ urls }: { urls: MemberPortalContactUrls }) {
  const { t } = useMemberPortalLang()
  if (!hasMemberPortalContactLinks(urls)) return null

  return (
    <div className="space-y-3">
      <SectionTitle title={t("profileContactTitle")} subtitle={t("profileContactSub")} />
      <GlassCard soft>
        <MemberPortalContactChannelButtons urls={urls} />
      </GlassCard>
    </div>
  )
}
