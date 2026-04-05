"use client"

import { POSTile } from "./pos-tile"
import { DEFAULT_TILES, type POSTile as POSTileType } from "@/lib/pos-display"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

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
    <div className="flex-1 min-h-0 min-w-0 pt-8 pb-2 min-[768px]:pt-10 min-[768px]:pb-3 min-[1025px]:pt-12 min-[1025px]:pb-4 px-2 min-[768px]:px-3 min-[1025px]:px-4 overflow-x-hidden overflow-y-auto grid grid-cols-1 min-[768px]:grid-cols-2 gap-2 min-[1025px]:gap-3 items-stretch">
      {/* 왼쪽: 주문 영역 - 제목이 테두리 위에 걸친 스타일 */}
      {orderTiles.length > 0 && (
        <section className="relative flex min-w-0 flex-col min-h-0 rounded-xl bg-white border-2 border-emerald-200 shadow-md shadow-emerald-500/10 overflow-x-hidden overflow-y-visible">
          <div className="absolute top-0 left-3 z-10 -translate-y-1/2 min-[768px]:left-4">
            <span className="inline-block max-w-[calc(100vw-2rem)] truncate px-3 py-1 min-[768px]:px-4 min-[768px]:py-1.5 rounded-lg bg-white border-2 border-emerald-300 text-sm min-[768px]:text-base min-[1025px]:text-lg font-bold tracking-wide text-emerald-700 shadow-sm">
              {t('posOrder')}
            </span>
          </div>
          <div className="pt-9 pb-3 min-[768px]:pt-10 min-[1025px]:pt-12 min-[1025px]:pb-4 px-1.5 min-[768px]:px-2 min-[1025px]:px-3 flex-1 min-h-0 min-w-0 flex flex-col">
            <div className="grid w-full min-w-0 flex-1 min-h-0 grid-cols-2 grid-rows-[1fr_1fr_1fr] gap-1.5 min-[480px]:gap-2 min-[1025px]:gap-3 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]">
              {orderTiles.map((tile) => (
                <div key={tile.id} className="min-w-0 h-full min-h-0">
                  <POSTile
                    tile={tile}
                    label={tile.labelKey ? t(tile.labelKey) : (isKorean ? tile.label : (tile.labelEn ?? tile.sublabel ?? tile.label))}
                    onClick={() => onTileClick?.(tile)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 오른쪽: 관리 영역 - 제목이 테두리 위에 걸친 스타일 */}
      {otherTiles.length > 0 && (
        <section className="relative flex min-w-0 flex-col min-h-0 rounded-xl bg-slate-50/90 border-2 border-slate-300 shadow-md shadow-slate-400/10 overflow-x-hidden overflow-y-visible">
          <div className="absolute top-0 left-3 z-10 -translate-y-1/2 min-[768px]:left-4">
            <span className="inline-block max-w-[calc(100vw-2rem)] truncate px-3 py-1 min-[768px]:px-4 min-[768px]:py-1.5 rounded-lg bg-white border-2 border-slate-400 text-sm min-[768px]:text-base min-[1025px]:text-lg font-bold tracking-wide text-slate-700 shadow-sm">
              {t('posManage')}
            </span>
          </div>
          <div className="pt-9 pb-3 min-[768px]:pt-10 min-[1025px]:pt-12 min-[1025px]:pb-4 px-1.5 min-[768px]:px-2 min-[1025px]:px-3 flex-1 min-h-0 min-w-0 flex flex-col">
            <div
              className={[
                "grid w-full min-w-0 flex-1 min-h-0",
                "grid-cols-1 min-[420px]:grid-cols-2",
                "gap-1.5 min-[480px]:gap-2 min-[1025px]:gap-3",
                "content-start",
                "min-[420px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)]",
              ].join(" ")}
            >
              {otherTiles.map((tile) => (
                <div key={tile.id} className="min-w-0 h-full min-h-[72px] min-[420px]:min-h-0">
                  <POSTile
                    tile={tile}
                    label={tile.labelKey ? t(tile.labelKey) : (isKorean ? tile.label : (tile.labelEn ?? tile.sublabel ?? tile.label))}
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
