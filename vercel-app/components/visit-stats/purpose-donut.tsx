"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatMinutesWithT } from "@/lib/visit-data"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type PurposeDonutProps = {
  data: { name: string; totalMin: number; visits: number }[]
}

const COLORS: Record<string, string> = {
  "정기점검": "#2563eb", "정기 점검": "#2563eb",
  "직원교육": "#059669", "직원 교육": "#059669",
  "긴급지원": "#dc2626", "긴급 지원": "#dc2626",
  "매장미팅": "#d97706", "매장 미팅": "#d97706",
  "물건배송": "#8b5cf6", "물건 배송": "#8b5cf6",
  "기타": "#6b7280",
}
function getPurposeColor(p: string): string {
  if (p.startsWith("기타:") || p.startsWith("기타：")) return COLORS["기타"]
  return COLORS[p] || "#6b7280"
}
const FALLBACK_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f97316"]

function purposeToKey(p: string): string {
  if (p.startsWith("기타:") || p.startsWith("기타：")) return "visitPurposeEtc"
  const m: Record<string, string> = {
    "정기점검": "visitPurposeInspect", "정기 점검": "visitPurposeInspect",
    "직원교육": "visitPurposeTraining", "직원 교육": "visitPurposeTraining",
    "긴급지원": "visitPurposeUrgent", "긴급 지원": "visitPurposeUrgent",
    "매장미팅": "visitPurposeMeeting", "매장 미팅": "visitPurposeMeeting",
    "물건배송": "visitPurposeDelivery", "물건 배송": "visitPurposeDelivery",
    "기타": "visitPurposeEtc",
  }
  return m[p] || ""
}

export function PurposeDonut({ data }: PurposeDonutProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const totalMin = data.reduce((s, d) => s + d.totalMin, 0)

  const chartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.name,
      { label: d.name, color: getPurposeColor(d.name) || FALLBACK_COLORS[i % 4] },
    ])
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-[14px] font-semibold text-foreground">{t("visit_purpose_ratio")}</h3>
      <div className="flex items-center gap-6">
        <ChartContainer config={chartConfig} className="h-[180px] w-[180px] aspect-square shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="text-foreground font-medium">
                        {formatMinutesWithT(Number(value), t)}
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="totalMin"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry, idx) => (
                  <Cell
                    key={entry.name}
                    fill={getPurposeColor(entry.name) || FALLBACK_COLORS[idx % 4]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="flex flex-col gap-2.5 min-w-0">
          {data.map((d, i) => {
            const pct = totalMin > 0 ? ((d.totalMin / totalMin) * 100).toFixed(1) : "0"
            const color = getPurposeColor(d.name) || FALLBACK_COLORS[i % 4]
            const labelKey = purposeToKey(d.name)
            const label = labelKey
              ? (d.name.startsWith("기타:") || d.name.startsWith("기타：")
                ? `${t(labelKey)}: ${d.name.replace(/^기타[：:]\s*/, "")}`
                : t(labelKey))
              : d.name
            return (
              <div key={d.name} className="flex items-center gap-2.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[12px] text-foreground font-medium min-w-0 truncate" title={d.name}>{label}</span>
                <span className="text-[12px] text-muted-foreground">{pct}%</span>
                <span className="text-[11px] text-muted-foreground">({d.visits}{t("visit_count_suffix")})</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
