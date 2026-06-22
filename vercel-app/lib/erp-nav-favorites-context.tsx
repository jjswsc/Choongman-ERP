"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { canViewMobileStoreSales } from "@/lib/permissions"
import {
  ERP_NAV_FAVORITES_CHANGED_EVENT,
  ERP_NAV_FAVORITES_MAX,
  erpNavFavoritesStorageKey,
  getErpNavDashboardQuickHrefs,
  moveErpNavFavoriteHref,
  readErpNavFavoritesFromStorage,
  resolveErpNavFavoriteHrefs,
  sanitizeErpNavFavoriteHrefs,
  toggleErpNavFavoriteHref,
  writeErpNavFavoritesToStorage,
} from "@/lib/erp-nav-favorites"
import { useErpNavAccess } from "@/lib/use-erp-nav-access"

type ErpNavFavoritesContextValue = {
  favoriteHrefs: string[]
  dashboardQuickHrefs: string[]
  isCustom: boolean
  isFavorite: (href: string) => boolean
  toggleFavorite: (href: string) => boolean
  setFavoriteHrefs: (hrefs: string[]) => void
  moveFavorite: (href: string, direction: "up" | "down") => void
  resetToDefaults: () => void
  maxFavorites: number
}

const ErpNavFavoritesContext = React.createContext<ErpNavFavoritesContextValue | null>(null)

export function ErpNavFavoritesProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth()
  const { accessibleHrefSet } = useErpNavAccess()
  const storageKey = React.useMemo(() => erpNavFavoritesStorageKey(auth), [auth])
  const role = auth?.role || ""

  const [favoriteHrefs, setFavoriteHrefsState] = React.useState<string[]>([])
  const [isCustom, setIsCustom] = React.useState(false)

  const reload = React.useCallback(() => {
    const stored = readErpNavFavoritesFromStorage(storageKey)
    const resolved = resolveErpNavFavoriteHrefs(stored, role, accessibleHrefSet, {
      includeMobileStoreSales: canViewMobileStoreSales(role),
    })
    setFavoriteHrefsState(resolved.hrefs)
    setIsCustom(resolved.isCustom)
  }, [accessibleHrefSet, role, storageKey])

  React.useEffect(() => {
    reload()
  }, [reload])

  React.useEffect(() => {
    const onChanged = () => reload()
    window.addEventListener(ERP_NAV_FAVORITES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(ERP_NAV_FAVORITES_CHANGED_EVENT, onChanged)
  }, [reload])

  const persist = React.useCallback(
    (hrefs: string[]) => {
      const next = sanitizeErpNavFavoriteHrefs(hrefs, accessibleHrefSet)
      setFavoriteHrefsState(next)
      setIsCustom(true)
      writeErpNavFavoritesToStorage(storageKey, { hrefs: next })
    },
    [accessibleHrefSet, storageKey]
  )

  const toggleFavorite = React.useCallback(
    (href: string) => {
      const h = String(href || "").trim()
      if (!h || !accessibleHrefSet.has(h)) return false
      const wasFavorite = favoriteHrefs.includes(h)
      if (!wasFavorite && favoriteHrefs.length >= ERP_NAV_FAVORITES_MAX) return false
      persist(toggleErpNavFavoriteHref(favoriteHrefs, h))
      return true
    },
    [accessibleHrefSet, favoriteHrefs, persist]
  )

  const setFavoriteHrefs = React.useCallback(
    (hrefs: string[]) => {
      persist(hrefs)
    },
    [persist]
  )

  const moveFavorite = React.useCallback(
    (href: string, direction: "up" | "down") => {
      persist(moveErpNavFavoriteHref(favoriteHrefs, href, direction))
    },
    [favoriteHrefs, persist]
  )

  const resetToDefaults = React.useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        localStorage.removeItem(storageKey)
        window.dispatchEvent(new CustomEvent(ERP_NAV_FAVORITES_CHANGED_EVENT))
      } catch {
        /* ignore */
      }
    }
    reload()
  }, [reload, storageKey])

  const value = React.useMemo<ErpNavFavoritesContextValue>(
    () => ({
      favoriteHrefs,
      dashboardQuickHrefs: getErpNavDashboardQuickHrefs(favoriteHrefs),
      isCustom,
      isFavorite: (href) => favoriteHrefs.includes(href),
      toggleFavorite,
      setFavoriteHrefs,
      moveFavorite,
      resetToDefaults,
      maxFavorites: ERP_NAV_FAVORITES_MAX,
    }),
    [favoriteHrefs, isCustom, moveFavorite, resetToDefaults, setFavoriteHrefs, toggleFavorite]
  )

  return <ErpNavFavoritesContext.Provider value={value}>{children}</ErpNavFavoritesContext.Provider>
}

export function useErpNavFavorites() {
  const ctx = React.useContext(ErpNavFavoritesContext)
  if (!ctx) {
    throw new Error("useErpNavFavorites must be used within ErpNavFavoritesProvider")
  }
  return ctx
}
