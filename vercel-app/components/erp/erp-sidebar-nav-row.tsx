"use client"

import * as React from "react"
import Link from "next/link"
import { Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { useErpNavFavorites } from "@/lib/erp-nav-favorites-context"
import { appAlert } from "@/lib/app-message"
import type { ErpNavMenuItem } from "@/lib/erp-nav-registry"

type ErpSidebarNavRowProps = {
  item: ErpNavMenuItem
  pathname: string
  active?: boolean
  showFavoriteToggle?: boolean
  badge?: React.ReactNode
  className?: string
}

export function ErpSidebarNavRow({
  item,
  pathname,
  active,
  showFavoriteToggle = true,
  badge,
  className,
}: ErpSidebarNavRowProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => tOr(t, key, fallback)
  const { isFavorite, toggleFavorite, maxFavorites } = useErpNavFavorites()
  const favorite = isFavorite(item.href)
  const isActiveResolved = active ?? pathname === item.href.split("?")[0]

  const onToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = toggleFavorite(item.href)
    if (!ok && !favorite) {
      void appAlert(
        tr("erpNavFavoritesMax", "즐겨찾기는 최대 {max}개까지 추가할 수 있습니다.").replace(
          "{max}",
          String(maxFavorites)
        )
      )
    }
  }

  return (
    <div className={cn("group/nav flex items-center gap-0.5", className)}>
      <Link
        href={item.href}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
          isActiveResolved
            ? "bg-primary text-primary-foreground font-medium shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
        )}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        <span className="truncate flex-1 group-data-[collapsible=icon]:hidden">{t(item.titleKey)}</span>
        {badge}
      </Link>
      {showFavoriteToggle ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          className={cn(
            "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded transition-opacity group-data-[collapsible=icon]:hidden",
            favorite
              ? "text-amber-400 opacity-100"
              : "text-sidebar-foreground/70 opacity-0 hover:text-amber-300 group-hover/nav:opacity-100",
            isActiveResolved && !favorite && "opacity-70"
          )}
          aria-label={
            favorite
              ? tr("erpNavFavoriteRemove", "즐겨찾기 해제")
              : tr("erpNavFavoriteAdd", "즐겨찾기 추가")
          }
          title={
            favorite
              ? tr("erpNavFavoriteRemove", "즐겨찾기 해제")
              : tr("erpNavFavoriteAdd", "즐겨찾기 추가")
          }
        >
          <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
