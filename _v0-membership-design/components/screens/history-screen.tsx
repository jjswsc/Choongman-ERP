"use client"

import { useState } from "react"
import { ChevronLeft, ArrowUpRight, Gift, Sparkles } from "lucide-react"
import { StatusBar } from "@/components/phone-frame"
import {
  history,
  historyFilters,
  type HistoryFilter,
  type HistoryType,
} from "@/lib/data"

const typeMeta: Record<
  HistoryType,
  { icon: typeof ArrowUpRight; tone: string; bg: string }
> = {
  earn: { icon: ArrowUpRight, tone: "text-success", bg: "bg-success/10" },
  bonus: { icon: Sparkles, tone: "text-success", bg: "bg-success/10" },
  redeem: { icon: Gift, tone: "text-primary", bg: "bg-accent" },
}

function matches(type: HistoryType, filter: HistoryFilter) {
  if (filter === "all") return true
  if (filter === "points") return type === "earn" || type === "bonus"
  if (filter === "reward") return type === "redeem"
  return false
}

export function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [filter, setFilter] = useState<HistoryFilter>("all")
  const filtered = history.filter((h) => matches(h.type, filter))

  return (
    <div className="flex flex-col">
      <StatusBar />
      <header className="flex items-center px-4 py-2">
        <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="p-2 -ml-2">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 text-center text-base font-bold">ประวัติการใช้งาน</h1>
        <span className="w-6" />
      </header>

      {/* filter tabs */}
      <div className="flex gap-2 px-4 py-2">
        {historyFilters.map((f) => {
          const isActive = f.id === filter
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground ring-1 ring-primary"
                  : "text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <ul className="flex flex-col px-4 pt-1">
        {filtered.map((item) => {
          const meta = typeMeta[item.type]
          const Icon = meta.icon
          const positive = item.amount > 0
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 border-b border-border py-4"
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${meta.bg} ${meta.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-bold ${
                    positive ? "text-success" : "text-destructive"
                  }`}
                >
                  {positive ? "+" : ""}
                  {item.amount} P
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{item.date}</p>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="px-4 py-5">
        <button
          type="button"
          className="w-full rounded-full bg-accent py-3.5 text-sm font-bold text-accent-foreground"
        >
          ดูประวัติทั้งหมด
        </button>
      </div>
    </div>
  )
}
