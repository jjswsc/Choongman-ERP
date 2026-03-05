"use client"

import { POSTile } from "./pos-tile"
import { DEFAULT_TILES, GRID_CLASSES, type POSTile as POSTileType } from "@/lib/pos-display"

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
  const sortedTiles = [...tiles]
    .filter((t) => t.enabled)
    .sort((a, b) => a.order - b.order)

  const orderTiles = sortedTiles.filter((t) => t.group === "order")
  const otherTiles = sortedTiles.filter((t) => t.group !== "order")

  return (
    <div className="flex-1 p-4 min-[1025px]:p-6 overflow-auto grid grid-cols-1 min-[768px]:grid-cols-2 gap-4 min-[1025px]:gap-5">
      {/* 왼쪽: 주문 영역 - 매장 주문 + 포장, 배달 */}
      {orderTiles.length > 0 && (
        <section className="flex flex-col gap-3 min-[1025px]:gap-4 p-4 min-[1025px]:p-5 rounded-2xl bg-white border-2 border-emerald-200 shadow-md shadow-emerald-500/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-1">
            {isKorean ? "주문" : "Order"}
          </h2>
          <div
            className={[
              "grid grid-cols-2 gap-3 min-[1025px]:gap-4",
              "auto-rows-[minmax(100px,1fr)] min-[1025px]:auto-rows-[minmax(120px,1fr)]",
            ].join(" ")}
            style={{ gridTemplateRows: "1fr 1fr 1fr" }}
          >
            {orderTiles.map((tile) => (
              <POSTile
                key={tile.id}
                tile={tile}
                label={isKorean ? tile.label : (tile.labelEn ?? tile.sublabel ?? tile.label)}
                onClick={() => onTileClick?.(tile)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 오른쪽: 관리 - 영수증, 마감 등 */}
      {otherTiles.length > 0 && (
        <section className="flex flex-col gap-3 min-[1025px]:gap-4 p-4 min-[1025px]:p-5 rounded-2xl bg-slate-50/80 border border-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">
            {isKorean ? "관리" : "Manage"}
          </h2>
          <div
            className={[
              "grid",
              GRID_CLASSES.main,
              "auto-rows-[minmax(100px,1fr)] min-[1025px]:auto-rows-[minmax(110px,1fr)] min-[1200px]:auto-rows-[minmax(120px,1fr)]",
              "gap-3 min-[1025px]:gap-4",
            ].join(" ")}
          >
            {otherTiles.map((tile) => (
              <POSTile
                key={tile.id}
                tile={tile}
                label={isKorean ? tile.label : (tile.labelEn ?? tile.sublabel ?? tile.label)}
                onClick={() => onTileClick?.(tile)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
