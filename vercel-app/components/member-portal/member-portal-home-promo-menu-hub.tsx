"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, MapPin, Percent } from "lucide-react"
import { getBangkokMonthRange } from "@/lib/bangkok-time"
import {
  readMemberPortalPromoStoreCodeFromLocalStorage,
  writeMemberPortalPromoStoreCodeToLocalStorage,
} from "@/lib/member-portal-client-storage"
import {
  listMemberPortalHomeNewMenusForMonth,
  listMemberPortalHomePromosForStore,
  pickDefaultMemberPortalPromoStoreCode,
  type MemberPortalContentItem,
} from "@/lib/member-portal-content"
import { MP_HOME_CARD_RADIUS } from "@/lib/member-portal-home-layout"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { normStoreKey } from "@/lib/store-list-keys"
import { MemberPortalHeroCarousel } from "@/components/member-portal/member-portal-home-hero-banner"
import type { MemberPortalStoreRow } from "@/components/member-portal/member-portal-app-utils"

type HomeHubPanel = "idle" | "promo" | "newMenu"

function ClocheIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 16.5c0-5.2 3.6-9.2 8-9.2s8 4 8 9.2" />
      <path d="M12 7.3V5.2" />
      <path d="M10.4 5.2h3.2" />
      <path d="M3.2 16.5h17.6" />
      <path d="M5 19h14" />
    </svg>
  )
}

function storeLabel(store: Pick<MemberPortalStoreRow, "displayName" | "storeCode">): string {
  return store.displayName || store.storeCode
}

export function MemberPortalHomePromoMenuHub({
  contentItems,
  stores,
  joinStoreCode,
  favoriteStoreCodes,
  t,
  onOrder,
  onSelectItem,
}: {
  contentItems: MemberPortalContentItem[]
  stores: MemberPortalStoreRow[]
  joinStoreCode?: string
  favoriteStoreCodes: string[]
  t: (key: MemberPortalKey, vars?: Record<string, string>) => string
  onOrder: () => void
  onSelectItem: (item: MemberPortalContentItem) => void
}) {
  const [panel, setPanel] = React.useState<HomeHubPanel>("idle")
  const [selectedStoreCode, setSelectedStoreCode] = React.useState("")

  React.useEffect(() => {
    if (!stores.length) {
      setSelectedStoreCode("")
      return
    }
    setSelectedStoreCode((current) => {
      if (current && stores.some((s) => normStoreKey(s.storeCode) === normStoreKey(current))) {
        return current
      }
      return pickDefaultMemberPortalPromoStoreCode({
        availableStoreCodes: stores.map((s) => s.storeCode),
        preferredStoreCodes: [
          readMemberPortalPromoStoreCodeFromLocalStorage(),
          joinStoreCode,
          ...favoriteStoreCodes,
        ],
      })
    })
  }, [stores, joinStoreCode, favoriteStoreCodes])

  const selectedStore = React.useMemo(
    () => stores.find((s) => normStoreKey(s.storeCode) === normStoreKey(selectedStoreCode)) || null,
    [stores, selectedStoreCode]
  )

  const otherStores = React.useMemo(
    () => stores.filter((s) => normStoreKey(s.storeCode) !== normStoreKey(selectedStoreCode)).slice(0, 8),
    [stores, selectedStoreCode]
  )

  const promoItems = React.useMemo(() => {
    const monthRange = getBangkokMonthRange()
    return listMemberPortalHomePromosForStore(
      contentItems,
      monthRange.yearMonth,
      monthRange,
      selectedStoreCode,
      "dine"
    )
  }, [contentItems, selectedStoreCode])

  const newMenuItems = React.useMemo(() => {
    const monthRange = getBangkokMonthRange()
    return listMemberPortalHomeNewMenusForMonth(contentItems, monthRange.yearMonth, monthRange)
  }, [contentItems])

  const selectStore = React.useCallback((storeCode: string) => {
    const code = String(storeCode || "").trim()
    setSelectedStoreCode(code)
    writeMemberPortalPromoStoreCodeToLocalStorage(code)
  }, [])

  const togglePanel = React.useCallback((next: Exclude<HomeHubPanel, "idle">) => {
    setPanel((prev) => (prev === next ? "idle" : next))
  }, [])

  const selectedStoreName = selectedStore ? storeLabel(selectedStore) : selectedStoreCode

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => togglePanel("promo")}
          aria-pressed={panel === "promo"}
          className={`${MP_HOME_CARD_RADIUS} relative overflow-hidden bg-gradient-to-br from-[#ff8a33] to-[#ef5513] px-3.5 py-3.5 text-left text-white shadow-[0_10px_22px_-10px_rgba(239,85,19,0.65)] transition active:scale-[0.98] ${
            panel === "promo" ? "ring-2 ring-[#ef5513]/40 ring-offset-2 ring-offset-[#faf7f2]" : ""
          }`}
        >
          <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <Percent className="h-4 w-4" strokeWidth={2.6} />
          </span>
          <p className="text-[13px] font-black leading-tight">{t("homePromoDiscountTitle")}</p>
          <p className="mt-0.5 text-[10px] font-medium leading-snug text-white/85">{t("homePromoDiscountSub")}</p>
        </button>

        <button
          type="button"
          onClick={() => togglePanel("newMenu")}
          aria-pressed={panel === "newMenu"}
          className={`${MP_HOME_CARD_RADIUS} relative overflow-hidden border border-[#f3e2d2] bg-gradient-to-br from-[#fffaf4] to-[#fff1e4] px-3.5 py-3.5 text-left shadow-[0_10px_22px_-12px_rgba(80,40,10,0.18)] transition active:scale-[0.98] ${
            panel === "newMenu" ? "ring-2 ring-[#ef5513]/30 ring-offset-2 ring-offset-[#faf7f2]" : ""
          }`}
        >
          <span className="pointer-events-none absolute right-3 top-2 font-[Georgia,Times,serif] text-[15px] italic text-[#ef7a3a]">
            {t("homeNewMenuBadge")}
          </span>
          <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#fff4e8] text-[#ef5513]">
            <ClocheIcon className="h-4 w-4" />
          </span>
          <p className="pr-8 text-[13px] font-black leading-tight text-[#3a2417]">{t("homeNewMenuTitle")}</p>
          <p className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium leading-snug text-[#8a6a52]">
            {t("homeNewMenuCardSub")}
            <ChevronRight className="h-3 w-3" />
          </p>
        </button>
      </div>

      {panel === "promo" ? (
        <div className="space-y-3">
          {stores.length > 0 ? (
            <section className={`${MP_HOME_CARD_RADIUS} border border-[#f0e2d4] bg-white px-3.5 py-3.5 shadow-[0_8px_18px_-12px_rgba(80,40,10,0.16)]`}>
              <div className="mb-2.5 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#ef5513]" />
                <div>
                  <p className="text-[13px] font-black text-[#3a2417]">{t("homePromoSelectStoreTitle")}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#8a6a52]">{t("homePromoSelectStoreSub")}</p>
                </div>
              </div>
              <label className="relative block">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#ef5513]" />
                <select
                  value={selectedStoreCode}
                  onChange={(e) => selectStore(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-[#f0e2d4] bg-[#fff8f3] py-2 pl-9 pr-9 text-sm font-semibold text-[#3a2417]"
                  aria-label={t("homePromoSelectStoreTitle")}
                >
                  {stores.map((store) => (
                    <option key={store.storeCode} value={store.storeCode}>
                      {storeLabel(store)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a6a52]" />
              </label>
              {otherStores.length > 0 ? (
                <div className="mt-2.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <span className="shrink-0 rounded-full bg-[#f4ece4] px-2.5 py-1 text-[10px] font-semibold text-[#8a6a52]">
                    {t("homePromoOtherStores")}
                  </span>
                  {otherStores.map((store) => (
                    <button
                      key={store.storeCode}
                      type="button"
                      onClick={() => selectStore(store.storeCode)}
                      className="shrink-0 rounded-full border border-[#f0e2d4] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#5c4030] transition hover:border-[#ef5513]/40 hover:text-[#ef5513]"
                    >
                      {storeLabel(store)}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <h3 className="m-0 text-sm font-black text-[#3a2417]">{t("homePromoOfThisStore")}</h3>
              {selectedStoreName ? (
                <span className="shrink-0 rounded-full bg-[#fff1e4] px-2 py-0.5 text-[10px] font-semibold text-[#ef5513]">
                  {t("homePromoStoreOnlyBadge", { store: selectedStoreName })}
                </span>
              ) : null}
            </div>
            {promoItems.length > 0 ? (
              <MemberPortalHeroCarousel
                items={promoItems}
                fallbackTitle={t("homePromoDiscountTitle")}
                onSelectItem={onSelectItem}
              />
            ) : (
              <p className={`${MP_HOME_CARD_RADIUS} border border-dashed border-[#f0e2d4] bg-white px-4 py-8 text-center text-xs text-[#8a6a52]`}>
                {t("homePromoEmpty")}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {panel === "newMenu" ? (
        <div>
          <div className="mb-2 flex items-center gap-1.5 px-0.5">
            <h3 className="m-0 text-sm font-black text-[#3a2417]">{t("homeNewMenuTitle")}</h3>
            <span className="rounded-full bg-[#ef5513] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
              {t("homeNewMenuBadge")}
            </span>
          </div>
          {newMenuItems.length > 0 ? (
            <MemberPortalHeroCarousel
              items={newMenuItems}
              fallbackTitle={t("homeNewMenuTitle")}
              ctaLabel={t("homePromoOrderNow")}
              onSelectItem={onSelectItem}
              onCta={onOrder}
            />
          ) : (
            <p className={`${MP_HOME_CARD_RADIUS} border border-dashed border-[#f0e2d4] bg-white px-4 py-8 text-center text-xs text-[#8a6a52]`}>
              {t("homeNewMenuEmpty")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
