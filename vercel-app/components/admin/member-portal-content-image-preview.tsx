"use client"

import {
  MP_HOME_CARD_RADIUS,
  MP_HOME_HERO_HEIGHT,
} from "@/lib/member-portal-home-layout"
import type { MemberPortalContentAdminCategory } from "@/lib/member-portal-content-admin"

type MemberPortalContentImagePreviewProps = {
  category: MemberPortalContentAdminCategory | "promo" | "popup" | "new_menu" | "info"
  imageUrl: string
  title?: string
  body?: string
  alt?: string
  className?: string
}

export function MemberPortalContentImagePreview({
  category,
  imageUrl,
  title,
  body,
  alt,
  className = "",
}: MemberPortalContentImagePreviewProps) {
  if (!imageUrl) return null

  if (category === "promo" || category === "new_menu") {
    return (
      <div
        className={`relative w-full overflow-hidden bg-[#261c12] shadow-sm ${MP_HOME_CARD_RADIUS} ${className}`}
      >
        <img
          src={imageUrl}
          alt={alt || title || ""}
          referrerPolicy="no-referrer"
          className={`${MP_HOME_HERO_HEIGHT} w-full object-cover object-right`}
          onError={(e) => {
            e.currentTarget.classList.add("opacity-40")
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#261c12]/95 via-[#261c12]/55 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex max-w-[58%] flex-col justify-center px-3 py-2.5">
          {title ? (
            <p className="line-clamp-2 text-sm font-bold leading-tight text-white">{title}</p>
          ) : null}
          {body ? <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-white/75">{body}</p> : null}
        </div>
      </div>
    )
  }

  if (category === "popup") {
    return (
      <div className={`overflow-hidden rounded-t-2xl border border-stone-200 bg-[#121214] ${className}`}>
        <div className="mx-auto mb-2 mt-2 h-1 w-8 rounded-full bg-white/20" />
        <img
          src={imageUrl}
          alt={alt || title || ""}
          referrerPolicy="no-referrer"
          className="mb-2 max-h-40 w-full object-cover px-3"
          onError={(e) => {
            e.currentTarget.classList.add("opacity-40")
          }}
        />
        {title ? <p className="px-3 pb-2 text-sm font-semibold text-white">{title}</p> : null}
      </div>
    )
  }

  return (
    <img
      src={imageUrl}
      alt={alt || title || ""}
      referrerPolicy="no-referrer"
      className={`max-h-40 w-full rounded-lg border object-cover ${className}`}
      onError={(e) => {
        e.currentTarget.classList.add("opacity-40")
      }}
    />
  )
}
