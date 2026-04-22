"use client"

import { cn } from "@/lib/utils"
import type { POSTile as POSTileType } from "@/lib/pos-display"
import {
  UtensilsCrossed,
  Package,
  Truck,
  FileText,
  FolderClosed,
  FolderOpen,
  Clock,
  Settings,
  RefreshCw,
  Wallet,
  Banknote,
  BarChart2,
  ArrowDownCircle,
  ArrowUpCircle,
  LogOut,
  Users,
} from "lucide-react"

const iconMap = {
  utensils: UtensilsCrossed,
  package: Package,
  truck: Truck,
  receipt: FileText,
  "folder-closed": FolderClosed,
  "folder-open": FolderOpen,
  clock: Clock,
  settings: Settings,
  "refresh-cw": RefreshCw,
  wallet: Wallet,
  banknote: Banknote,
  "bar-chart": BarChart2,
  "arrow-down-circle": ArrowDownCircle,
  "arrow-up-circle": ArrowUpCircle,
  "log-out": LogOut,
  users: Users,
} as const

interface POSTileProps {
  tile: POSTileType
  onClick?: () => void
  label?: string
}

export function POSTile({ tile, onClick, label }: POSTileProps) {
  const Icon = iconMap[tile.icon as keyof typeof iconMap] || UtensilsCrossed
  const isLarge = tile.size === "large"
  const isMedium = tile.size === "medium"
  const variant = tile.variant ?? "default"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!tile.enabled}
      className={cn(
        "group relative flex h-full w-full max-w-full min-w-0 overflow-hidden",
        "rounded-2xl border transition-all duration-300 ease-out",
        "touch-manipulation select-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60",
        "active:scale-[0.98]",
        isLarge && "flex-col items-center justify-center",
        !isLarge && "flex-row items-center justify-center gap-3 px-3",
        "min-h-[88px] min-[1025px]:min-h-[96px]",
        isLarge && "min-h-0 min-[1025px]:min-h-0",
        variant === "primary" && [
          "bg-gradient-to-br from-emerald-500 to-emerald-600",
          "border-emerald-600/80 text-white shadow-md",
          "hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg hover:shadow-emerald-500/30",
          "hover:border-emerald-700",
        ],
        variant === "accent" && [
          "bg-gradient-to-br from-amber-500 to-orange-500",
          "border-amber-600/80 text-white shadow-md",
          "hover:from-amber-600 hover:to-orange-600 hover:shadow-lg hover:shadow-amber-500/25",
        ],
        variant === "default" && [
          "bg-white border-slate-200 shadow-sm",
          "hover:bg-slate-50 hover:border-slate-300 hover:shadow-md",
        ],
        !tile.enabled && "opacity-40 cursor-not-allowed pointer-events-none"
      )}
    >
      {variant === "default" && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/60 to-transparent pointer-events-none" />
      )}

      {variant === "primary" && (
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="absolute inset-[-1px] rounded-2xl bg-gradient-to-r from-white/0 via-white/25 to-white/0 blur-sm" />
        </div>
      )}

      <div
        className={cn(
          "relative z-10 flex items-center justify-center shrink-0",
          "transition-all duration-300 group-hover:scale-105",
          isLarge && "mb-3 min-[1025px]:mb-4"
        )}
      >
        <Icon
          className={cn(
            "transition-colors duration-300",
            isLarge ? "w-12 h-12 min-[1025px]:w-14 min-[1025px]:h-14" : isMedium ? "w-8 h-8 min-[1025px]:w-9 min-[1025px]:h-9" : "w-7 h-7 min-[1025px]:w-8 min-[1025px]:h-8",
            variant === "primary" && "text-white",
            variant === "accent" && "text-white",
            variant === "default" && "text-slate-600 group-hover:text-slate-800"
          )}
          strokeWidth={1.5}
        />
      </div>

      <div className={cn("relative z-10 flex flex-col items-center min-w-0", !isLarge && "items-start")}>
        <span
          className={cn(
            "relative z-10 min-w-0 font-medium tracking-tight transition-colors duration-300 break-keep [overflow-wrap:anywhere] leading-snug",
            isLarge ? "text-center text-lg min-[1025px]:text-xl" : "text-left text-sm min-[1025px]:text-base",
            variant === "primary" && "text-white",
            variant === "accent" && "text-white",
            variant === "default" && "text-slate-700 group-hover:text-slate-900"
          )}
        >
          {label ?? tile.label}
        </span>
        {tile.sublabel && (
          <span
            className={cn(
              "relative z-10 font-mono uppercase tracking-widest transition-colors duration-300",
              isLarge ? "text-[10px] mt-1" : "text-[9px]",
              variant === "primary" || variant === "accent"
                ? "text-white/80"
                : "text-slate-500 group-hover:text-slate-600"
            )}
          >
            {tile.sublabel}
          </span>
        )}
      </div>
    </button>
  )
}
