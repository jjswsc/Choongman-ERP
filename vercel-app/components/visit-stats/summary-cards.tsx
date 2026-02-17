"use client"

import { Clock, MapPin, Users, Target } from "lucide-react"
import { formatMinutesWithT } from "@/lib/visit-data"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type SummaryProps = {
  totalMin: number
  totalVisits: number
  uniqueStores: number
  uniqueEmployees: number
}

export function SummaryCards({ totalMin, totalVisits, uniqueStores, uniqueEmployees }: SummaryProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const cards = [
    {
      label: t("visit_summary_total"),
      value: formatMinutesWithT(totalMin, t),
      sub: `${totalVisits}${t("visit_count_suffix")}`,
      icon: Clock,
      accent: "#2563eb",
      bg: "#eff6ff",
    },
    {
      label: t("visit_summary_stores"),
      value: `${uniqueStores}${t("visit_summary_count")}`,
      sub: `${t("visit_summary_stores_sub")} ${formatMinutesWithT(Math.round(totalMin / (uniqueStores || 1)), t)}`,
      icon: MapPin,
      accent: "#059669",
      bg: "#ecfdf5",
    },
    {
      label: t("visit_summary_employees"),
      value: `${uniqueEmployees}${t("visit_summary_count_people")}`,
      sub: `${t("visit_summary_employees_sub")} ${formatMinutesWithT(Math.round(totalMin / (uniqueEmployees || 1)), t)}`,
      icon: Users,
      accent: "#d97706",
      bg: "#fffbeb",
    },
    {
      label: t("visit_summary_avg"),
      value: formatMinutesWithT(Math.round(totalMin / (totalVisits || 1)), t),
      sub: `${totalVisits}${t("visit_count_suffix")} ${t("visit_summary_avg_sub")}`,
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
