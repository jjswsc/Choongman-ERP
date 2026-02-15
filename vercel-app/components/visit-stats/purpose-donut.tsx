"use client"

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatMinutes } from "@/lib/visit-data"

type PurposeDonutProps = {
  data: { name: string; totalMin: number; visits: number }[]
}

const COLORS: Record<string, string> = {
  "정기점검": "#2563eb",
  "직원교육": "#059669",
  "긴급지원": "#dc2626",
  "매장미팅": "#d97706",
}
const FALLBACK_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f97316"]

export function PurposeDonut({ data }: PurposeDonutProps) {
  const totalMin = data.reduce((s, d) => s + d.totalMin, 0)

  const chartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.name,
      { label: d.name, color: COLORS[d.name] || FALLBACK_COLORS[i % 4] },
    ])
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-[14px] font-semibold text-foreground">목적별 비율</h3>
      <div className="flex items-center gap-6">
        <ChartContainer config={chartConfig} className="h-[180px] w-[180px] aspect-square shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span className="text-foreground font-medium">
                        {formatMinutes(Number(value))}
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
                    fill={COLORS[entry.name] || FALLBACK_COLORS[idx % 4]}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="flex flex-col gap-2.5 min-w-0">
          {data.map((d, i) => {
            const pct = totalMin > 0 ? ((d.totalMin / totalMin) * 100).toFixed(1) : "0"
            const color = COLORS[d.name] || FALLBACK_COLORS[i % 4]
            return (
              <div key={d.name} className="flex items-center gap-2.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[12px] text-foreground font-medium w-[60px] truncate">{d.name}</span>
                <span className="text-[12px] text-muted-foreground">{pct}%</span>
                <span className="text-[11px] text-muted-foreground">({d.visits}건)</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
