"use client"

import { Clock, MapPin, Users, Target } from "lucide-react"
import { formatMinutes } from "@/lib/visit-data"

type SummaryProps = {
  totalMin: number
  totalVisits: number
  uniqueStores: number
  uniqueEmployees: number
}

export function SummaryCards({ totalMin, totalVisits, uniqueStores, uniqueEmployees }: SummaryProps) {
  const cards = [
    {
      label: "총 투입시간",
      value: formatMinutes(totalMin),
      sub: `${totalVisits}건`,
      icon: Clock,
      accent: "#2563eb",
      bg: "#eff6ff",
    },
    {
      label: "방문 매장",
      value: `${uniqueStores}개`,
      sub: `매장당 평균 ${formatMinutes(Math.round(totalMin / (uniqueStores || 1)))}`,
      icon: MapPin,
      accent: "#059669",
      bg: "#ecfdf5",
    },
    {
      label: "투입 인원",
      value: `${uniqueEmployees}명`,
      sub: `인당 평균 ${formatMinutes(Math.round(totalMin / (uniqueEmployees || 1)))}`,
      icon: Users,
      accent: "#d97706",
      bg: "#fffbeb",
    },
    {
      label: "건당 평균",
      value: formatMinutes(Math.round(totalMin / (totalVisits || 1))),
      sub: `${totalVisits}건 기준`,
      icon: Target,
      accent: "#7c3aed",
      bg: "#f5f3ff",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.label}
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-4"
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: card.bg }}
            >
              <Icon className="h-5 w-5" style={{ color: card.accent }} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-muted-foreground">{card.label}</p>
              <p className="text-[18px] font-bold text-foreground leading-tight">{card.value}</p>
              <p className="text-[11px] text-muted-foreground truncate">{card.sub}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
