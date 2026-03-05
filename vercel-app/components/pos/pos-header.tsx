"use client"

import { ArrowLeft, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface POSHeaderProps {
  title?: string
  onBack?: () => void
  showBackButton?: boolean
  todayOrders?: number
  totalAmount?: number
  className?: string
}

export function POSHeader({
  title = "POS",
  onBack,
  showBackButton = true,
  todayOrders = 0,
  totalAmount = 0,
  className,
}: POSHeaderProps) {
  return (
    <header
      className={cn(
        "flex-shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between h-14 min-[1025px]:h-16 px-4 min-[1025px]:px-6">
        <div className="flex items-center gap-4 min-w-[140px]">
          {showBackButton && (
            <button
              type="button"
              onClick={onBack}
              className={cn(
                "flex items-center gap-2 text-slate-600 hover:text-slate-900",
                "touch-manipulation min-h-[44px] px-2 -ml-2 rounded-lg",
                "transition-all duration-200 hover:bg-slate-100"
              )}
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm tracking-wide">Admin</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Activity className="w-4 h-4 text-emerald-600" strokeWidth={1.5} />
          </div>
          <h1 className="text-lg min-[1025px]:text-xl font-semibold tracking-tight text-slate-800">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-6 min-w-[140px] justify-end">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
              Today
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums text-slate-800">
                {todayOrders}
              </span>
              <span className="text-xs text-slate-500">orders</span>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-200" />

          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
              Revenue
            </span>
            <span className="text-lg font-semibold tabular-nums text-emerald-600">
              {totalAmount.toLocaleString()} ฿
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
