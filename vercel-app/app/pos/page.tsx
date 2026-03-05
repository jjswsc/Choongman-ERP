"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { POSHeader } from "@/components/pos/pos-header"
import { POSMainGrid } from "@/components/pos/pos-main-grid"
import { DEFAULT_TILES, type POSTile } from "@/lib/pos-display"
import { cn } from "@/lib/utils"
import { Circle } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
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

export default function POSMainPage() {
  const router = useRouter()
  const { auth } = useAuth()
  const { lang } = useLang()
  const { stores } = useStoreList()
  const [todaySales, setTodaySales] = useState<{
    completedCount: number
    completedTotal: number
    pendingCount: number
  } | null>(null)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)

  const storeCode = auth?.store || stores[0] || ""

  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!storeCode) return
    getPosTodaySales({ storeCode }).then(setTodaySales).catch(() => setTodaySales(null))
  }, [storeCode])

  const todayOrders = todaySales?.completedCount ?? 0
  const totalAmount = todaySales?.completedTotal ?? 0

  const visibleTiles = useMemo(() => {
    return DEFAULT_TILES.filter((tile) => {
      switch (tile.type) {
        case "receipt":
          return canAccessPosOrders(auth?.role || "")
        case "open":
        case "close":
          return canAccessPosSettlement(auth?.role || "")
        case "attendance":
        case "settings":
          return canAccessAdmin(auth?.role || "")
        case "expense":
          return isManagerOrFranchiseeRole(auth?.role || "") || isOfficeRole(auth?.role || "")
        default:
          return true
      }
    })
  }, [auth?.role])

  const handleTileClick = useCallback(
    (tile: POSTile) => {
      switch (tile.type) {
        case "dine-in":
          router.push("/pos/order?type=dine_in")
          break
        case "takeout":
          router.push("/pos/order?type=takeout")
          break
        case "delivery":
          router.push("/pos/order?type=delivery")
          break
        case "receipt":
          router.push("/admin/pos-orders")
          break
        case "open":
        case "close":
          router.push("/admin/pos-settlement")
          break
        case "attendance":
          router.push("/admin/attendance")
          break
        case "expense":
          router.push("/admin/petty-cash")
          break
        case "settings":
          router.push("/admin")
          break
        case "refresh":
          window.location.reload()
          break
        default:
          break
      }
    },
    [router]
  )

  const handleBack = useCallback(() => {
    router.push("/admin")
  }, [router])

  const formatDate = (date: Date) =>
    date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" })
  const formatTime = (date: Date) =>
    date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-gradient-to-b from-slate-50 to-slate-100 text-slate-800 overflow-hidden select-none"
      )}
    >
      <POSHeader
        title="POS Terminal"
        onBack={handleBack}
        showBackButton={true}
        todayOrders={todayOrders}
        totalAmount={totalAmount}
      />

      <POSMainGrid tiles={visibleTiles} onTileClick={handleTileClick} isKorean={lang === "ko"} />

      <footer className="flex-shrink-0 h-12 px-4 min-[1025px]:px-6 border-t border-slate-200 flex items-center justify-between bg-white/80 backdrop-blur-sm shadow-[0_-1px_0_0_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
              Online
            </span>
          </div>
          <span className="text-xs text-slate-600 font-mono">{storeCode || "POS"}</span>
        </div>
        {currentTime && (
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{formatDate(currentTime)}</span>
            <span className="text-sm font-mono font-medium tabular-nums text-slate-800">
              {formatTime(currentTime)}
            </span>
          </div>
        )}
      </footer>
    </div>
  )
}
