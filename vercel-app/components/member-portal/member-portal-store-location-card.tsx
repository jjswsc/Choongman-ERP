"use client"

import { ExternalLink, MapPin, Star } from "lucide-react"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
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
          <h3 className="text-base font-semibold leading-snug text-white">{store.displayName}</h3>
          {store.address ? (
            <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-white/70">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/85" aria-hidden />
              <span>{store.address}</span>
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-white/40">
            {t("locationCode")} · {store.storeCode}
          </p>
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
            className={`inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition ${
              isFavorite
                ? "border-amber-300/40 bg-amber-300/12 text-amber-100"
                : "border-white/12 bg-white/5 text-white/85 hover:bg-white/10"
            }`}
          >
            <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} aria-hidden />
            {isFavorite ? t("locationFavorite") : t("locationFavoriteSet")}
          </button>
        </div>
      </div>
    </GlassCard>
  )
}
