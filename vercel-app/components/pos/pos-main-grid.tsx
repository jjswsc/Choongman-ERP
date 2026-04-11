"use client"

import { POSTile } from "./pos-tile"
import { DEFAULT_TILES, type POSTile as POSTileType } from "@/lib/pos-display"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface POSMainGridProps {
  tiles?: POSTileType[]
  onTileClick?: (tile: POSTileType) => void
  isKorean?: boolean
}

export function POSMainGrid({
  tiles = DEFAULT_TILES,
  onTileClick,
  isKorean = true,
}: POSMainGridProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const sortedTiles = [...tiles]
    .filter((t) => t.enabled)
    .sort((a, b) => a.order - b.order)

  const orderTiles = sortedTiles.filter((t) => t.group === "order")
  const otherTiles = sortedTiles.filter((t) => t.group !== "order")

  return (
    <div
      className={cn(
        "grid min-h-0 min-w-0 flex-1 grid-cols-1 items-stretch gap-2 px-2 pb-2 pt-2 min-[768px]:grid-cols-2 min-[768px]:gap-3 min-[768px]:px-3 min-[768px]:pb-3 min-[768px]:pt-3",
        "min-[1025px]:gap-4 min-[1025px]:px-4 min-[1025px]:pb-4 min-[1025px]:pt-4",
        /* overflow-x-hidden 은 떠 있는 라벨·세로 클리핑 이슈 유발 → 세로 스크롤만 */
        "overflow-y-auto overflow-x-visible overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y"
      )}
    >
      {orderTiles.length > 0 && (
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl",
            "border-2 border-emerald-200/90 bg-white shadow-lg shadow-emerald-500/[0.07]",
            "ring-1 ring-emerald-100/60"
          )}
        >
          <header className="shrink-0 border-b border-emerald-100/90 bg-gradient-to-r from-emerald-50/95 via-white to-teal-50/40 px-3 py-3 min-[768px]:px-4 min-[768px]:py-3.5">
            <h2 className="text-base font-bold tracking-wide text-emerald-800 min-[768px]:text-lg min-[1025px]:text-xl">
              {t("posOrder")}
            </h2>
          </header>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 min-[768px]:p-3 min-[1025px]:p-4">
            <div
              className={cn(
                "grid min-h-[min(52vh,22rem)] w-full min-w-0 flex-1 auto-rows-[minmax(0,1fr)]",
                "grid-cols-2 grid-rows-3 gap-2 min-[1025px]:gap-3",
                "[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]"
              )}
            >
              {orderTiles.map((tile) => {
                const isLarge = tile.size === "large"
                return (
                  <div
                    key={tile.id}
                    className={cn(
                      "min-h-0 min-w-0",
                      isLarge ? "col-span-2 row-span-2" : "col-span-1 row-span-1"
                    )}
                  >
                    <POSTile
                      tile={tile}
                      label={
                        tile.labelKey
                          ? t(tile.labelKey)
                          : isKorean
                            ? tile.label
                            : (tile.labelEn ?? tile.sublabel ?? tile.label)
                      }
                      onClick={() => onTileClick?.(tile)}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {otherTiles.length > 0 && (
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl",
            "border-2 border-slate-300/85 bg-gradient-to-b from-slate-50/95 to-slate-100/80",
            "shadow-lg shadow-slate-400/[0.08] ring-1 ring-slate-200/70"
          )}
        >
          <header className="shrink-0 border-b border-slate-200/90 bg-gradient-to-r from-slate-100/90 via-white to-slate-50/50 px-3 py-3 min-[768px]:px-4 min-[768px]:py-3.5">
            <h2 className="text-base font-bold tracking-wide text-slate-700 min-[768px]:text-lg min-[1025px]:text-xl">
              {t("posManage")}
            </h2>
          </header>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2 min-[768px]:p-3 min-[1025px]:p-4">
            <div
              className={cn(
                "grid w-full min-w-0 flex-1 auto-rows-[minmax(0,1fr)] content-start",
                "grid-cols-1 gap-2 min-[420px]:grid-cols-2 min-[1025px]:gap-3",
                "min-[420px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]"
              )}
            >
              {otherTiles.map((tile) => (
                <div
                  key={tile.id}
                  className="min-h-[76px] min-w-0 min-[420px]:min-h-[88px] min-[420px]:h-full min-[1025px]:min-h-[96px]"
                >
                  <POSTile
                    tile={tile}
                    label={
                      tile.labelKey
                        ? t(tile.labelKey)
                        : isKorean
                          ? tile.label
                          : (tile.labelEn ?? tile.sublabel ?? tile.label)
                    }
                    onClick={() => onTileClick?.(tile)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
