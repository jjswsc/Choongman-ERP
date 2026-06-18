"use client"

import {
  MP_HOME_HERO_HEIGHT,
  MP_HOME_PROMO_RADIUS,
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
        className={`relative w-full overflow-hidden bg-[#261c12] shadow-sm ${MP_HOME_PROMO_RADIUS} ${className}`}
      >
        <img
          src={imageUrl}
          alt={alt || title || ""}
          referrerPolicy="no-referrer"
          className={`${MP_HOME_HERO_HEIGHT} w-full object-cover object-center`}
          onError={(e) => {
            e.currentTarget.classList.add("opacity-40")
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex items-end px-3 pb-3">
          <span className="rounded-full bg-gradient-to-r from-[#ff9824] to-[#ef5513] px-3 py-1 text-[10px] font-bold text-white">
            Order now ›
          </span>
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
