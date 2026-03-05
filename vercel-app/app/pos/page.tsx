"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  UtensilsCrossed,
  Package,
  Truck,
  Wallet,
  FileText,
  Clock,
  Banknote,
  Settings,
  RefreshCw,
} from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import { getPosTodaySales } from "@/lib/api-client"
import {
  canAccessPosOrder,
  canAccessPosSettlement,
  canAccessPosOrders,
  canAccessAdmin,
  isManagerOrFranchiseeRole,
  isOfficeRole,
} from "@/lib/permissions"
import { cn } from "@/lib/utils"

type TileSize = "normal" | "large"

interface PosMainTile {
  id: string
  label: string
  labelEn?: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  action?: () => void
  color: "amber" | "orange" | "violet" | "slate"
  size?: TileSize
  /** 권한: 이 역할을 가져야 표시. 없으면 항상 표시 */
  requiresRole?: (role: string) => boolean
}

const TILES: PosMainTile[] = [
  {
    id: "order-dine",
    label: "매장 주문",
    labelEn: "Hall",
    icon: UtensilsCrossed,
    href: "/pos/order?type=dine_in",
    color: "amber",
    size: "large",
  },
  {
    id: "order-takeout",
    label: "포장",
    labelEn: "Takeout",
    icon: Package,
    href: "/pos/order?type=takeout",
    color: "amber",
  },
  {
    id: "order-delivery",
    label: "배달",
    labelEn: "Delivery",
    icon: Truck,
    href: "/pos/order?type=delivery",
    color: "orange",
  },
  {
    id: "receipt",
    label: "영수증 관리",
    labelEn: "Receipts",
    icon: FileText,
    href: "/admin/pos-orders",
    color: "slate",
    requiresRole: canAccessPosOrders,
  },
  {
    id: "settlement",
    label: "영업마감",
    labelEn: "Closing",
    icon: Wallet,
    href: "/admin/pos-settlement",
    color: "violet",
    requiresRole: canAccessPosSettlement,
  },
  {
    id: "attendance",
    label: "근태관리",
    labelEn: "Attendance",
    icon: Clock,
    href: "/admin/attendance",
    color: "violet",
    requiresRole: canAccessAdmin,
  },
  {
    id: "petty-cash",
    label: "경비",
    labelEn: "Petty Cash",
    icon: Banknote,
    href: "/admin/petty-cash",
    color: "violet",
    requiresRole: (r) => isManagerOrFranchiseeRole(r) || isOfficeRole(r),
  },
  {
    id: "admin",
    label: "운영 관리",
    labelEn: "Admin",
    icon: Settings,
    href: "/admin",
    color: "slate",
    requiresRole: canAccessAdmin,
  },
  {
    id: "refresh",
    label: "새로고침",
    labelEn: "Refresh",
    icon: RefreshCw,
    color: "slate",
    action: () => typeof window !== "undefined" && window.location.reload(),
  },
]

const colorClasses: Record<string, string> = {
  amber: "bg-amber-500/90 hover:bg-amber-500 text-slate-900 border-amber-400/50",
  orange: "bg-orange-500/90 hover:bg-orange-500 text-slate-900 border-orange-400/50",
  violet: "bg-violet-600/90 hover:bg-violet-600 text-white border-violet-500/50",
  slate: "bg-slate-700/90 hover:bg-slate-600 text-white border-slate-600/50",
}

export default function PosMainPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const { stores } = useStoreList()
  const [todaySales, setTodaySales] = React.useState<{
    completedCount: number
    completedTotal: number
    pendingCount: number
  } | null>(null)

  const storeCode = auth?.store || stores[0] || ""

  React.useEffect(() => {
    if (!storeCode) return
    getPosTodaySales({ storeCode })
      .then(setTodaySales)
      .catch(() => setTodaySales(null))
  }, [storeCode])

  const visibleTiles = TILES.filter((tile) => {
    if (!tile.requiresRole) return true
    return tile.requiresRole(auth?.role || "")
  })

  const handleTileClick = (tile: PosMainTile) => {
    if (tile.action) {
      tile.action()
      return
    }
    if (tile.href) {
      router.push(tile.href)
    }
  }

  const isKorean = lang === "ko"

  return (
    <div className="flex h-full flex-col overflow-auto p-4 sm:p-6">
      {/* 오늘 매출 요약 */}
      {todaySales != null && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3">
          <span className="text-sm text-slate-300">
            {t("posTodayCompleted") || "오늘 완료"}:{" "}
            <span className="font-bold text-amber-400">{todaySales.completedCount}</span>
            {t("posCount") || "건"}
          </span>
          <span className="text-lg font-bold tabular-nums text-white">
            {todaySales.completedTotal.toLocaleString()} ฿
          </span>
        </div>
      )}

      {/* 메인 화면 구성 */}
      <div className="mb-2 text-xs font-medium text-slate-400">
        {isKorean ? "사용" : "Usage"}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4">
        {visibleTiles.map((tile) => {
          const Icon = tile.icon
          const isLarge = tile.size === "large"
          const colorClass = colorClasses[tile.color] || colorClasses.slate
          const label = isKorean ? tile.label : (tile.labelEn || tile.label)

          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handleTileClick(tile)}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border p-4 transition active:scale-[0.98]",
                colorClass,
                isLarge && "col-span-2 row-span-2 min-h-[120px] sm:min-h-[140px]",
                !isLarge && "min-h-[80px]"
              )}
            >
              <Icon className={cn(isLarge ? "h-12 w-12" : "h-8 w-8")} />
              <span className={cn("text-center font-semibold", isLarge ? "text-base sm:text-lg" : "text-sm")}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
