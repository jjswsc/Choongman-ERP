"use client"

import { ExternalLink, MapPin, Star } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import {
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
  mpCardGhostBtnActiveClass,
  mpCardGhostBtnClass,
} from "@/lib/member-portal-design"
import { memberPortalGoogleMapsUrl, type MemberPortalStoreDto } from "@/lib/member-portal-stores"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"

type MemberPortalStoreLocationCardProps = {
  store: MemberPortalStoreDto
  photoUrl: string
  isFavorite: boolean
  onToggleFavorite: () => void
  t: (key: MemberPortalKey) => string
}

export function MemberPortalStoreLocationCard({
  store,
  photoUrl,
  isFavorite,
  onToggleFavorite,
  t,
}: MemberPortalStoreLocationCardProps) {
  const trimmedPhoto = String(photoUrl || "").trim()

  return (
    <GlassCard soft className="overflow-hidden p-0">
      <div className="relative aspect-[3/2] w-full bg-black/35">
        {trimmedPhoto ? (
          <img
            src={trimmedPhoto}
            alt={store.displayName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-amber-950/50 via-black/40 to-black/60"
            aria-hidden
          >
            <MapPin className="h-9 w-9 text-amber-300/55" />
            <span className="max-w-[85%] truncate px-3 text-center text-xs font-medium text-white/40">
              {store.displayName}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <div>
          <h3 className={`text-base font-semibold leading-snug ${MP_CARD_TEXT_PRIMARY}`}>{store.displayName}</h3>
          {store.address ? (
            <p className={`mt-2 flex items-start gap-2 text-sm leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600/85" aria-hidden />
              <span>{store.address}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.open(memberPortalGoogleMapsUrl(store), "_blank", "noopener,noreferrer")}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500/90 via-amber-400/90 to-amber-300/90 text-sm font-semibold text-[#1a1208] shadow-[0_6px_20px_rgba(212,175,55,0.22)] transition hover:from-amber-400 hover:to-amber-200"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
            {t("locationOpenGoogleMaps")}
          </button>
          <button
            type="button"
            onClick={onToggleFavorite}
            className={isFavorite ? mpCardGhostBtnActiveClass : mpCardGhostBtnClass}
          >
            <Star className={`h-4 w-4 ${isFavorite ? "fill-current text-amber-600" : ""}`} aria-hidden />
            {isFavorite ? t("locationFavorite") : t("locationFavoriteSet")}
          </button>
        </div>
      </div>
    </GlassCard>
  )
}
