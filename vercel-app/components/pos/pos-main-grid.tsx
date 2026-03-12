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
    <div className="flex-1 min-h-0 p-2 min-[768px]:p-3 min-[1025px]:p-4 overflow-auto grid grid-cols-1 min-[768px]:grid-cols-2 gap-2 min-[1025px]:gap-3 items-stretch">
      {/* 왼쪽: 주문 영역 - 매장 주문 + 포장, 배달 */}
      {orderTiles.length > 0 && (
        <section className="flex flex-col min-h-0 gap-1.5 min-[1025px]:gap-2 p-2 min-[1025px]:p-3 rounded-xl bg-white border-2 border-emerald-200 shadow-md shadow-emerald-500/10">
          <h2 className="text-base min-[768px]:text-lg min-[1025px]:text-xl font-bold tracking-wide text-emerald-700 shrink-0">
            {t('posOrder')}
          </h2>
          <div className="grid grid-cols-2 gap-2 min-[1025px]:gap-3 flex-1 min-h-0 grid-rows-[1fr_1fr_1fr]">
            {orderTiles.map((tile) => (
              <POSTile
                key={tile.id}
                tile={tile}
                label={tile.labelKey ? t(tile.labelKey) : (isKorean ? tile.label : (tile.labelEn ?? tile.sublabel ?? tile.label))}
                onClick={() => onTileClick?.(tile)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 오른쪽: 관리 - 영수증, 마감 등 */}
      {otherTiles.length > 0 && (
        <section className="flex flex-col min-h-0 gap-1.5 min-[1025px]:gap-2 p-2 min-[1025px]:p-3 rounded-xl bg-slate-50/80 border border-slate-200">
          <h2 className="text-base min-[768px]:text-lg min-[1025px]:text-xl font-bold tracking-wide text-slate-700 shrink-0">
            {t('posManage')}
          </h2>
          <div
            className={[
              "grid w-full flex-1 min-h-0",
              "grid-cols-2",
              "gap-2 min-[1025px]:gap-3",
              "content-start",
            ].join(" ")}
          >
            {otherTiles.map((tile) => (
              <POSTile
                key={tile.id}
                tile={tile}
                label={tile.labelKey ? t(tile.labelKey) : (isKorean ? tile.label : (tile.labelEn ?? tile.sublabel ?? tile.label))}
                onClick={() => onTileClick?.(tile)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
