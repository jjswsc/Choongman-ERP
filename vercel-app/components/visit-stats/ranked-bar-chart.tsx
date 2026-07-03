"use client"

import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatMinutesWithT } from "@/lib/visit-data"

type RankedBarChartProps = {
  title: string
  color: string
  data: { name: string; totalMin: number; visits: number }[]
  /** Y축·라벨 표시용 (집계 키는 data.name 그대로) */
  formatName?: (name: string) => string
  /** 긴 매장명 등 Y축 라벨 폭 (px) */
  yAxisWidth?: number
  /** 기본 220. 매장 수가 많을 때만 지정 */
  heightPx?: number
}

export function RankedBarChart({
  title,
  color,
  data,
  formatName,
  yAxisWidth = 100,
  heightPx = 220,
}: RankedBarChartProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const inputTimeLabel = t("visit_chart_input_time")
  const chartConfig = {
    totalMin: { label: inputTimeLabel, color },
  }

  const maxVal = Math.max(...data.map((d) => d.totalMin), 1)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">
          {data.length}{t("visit_chart_items")}
        </span>
      </div>
      <ChartContainer config={chartConfig} className="w-full aspect-auto" style={{ height: heightPx }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: 12, fill: "hsl(220, 13%, 40%)" }}
              tickFormatter={(name) => (formatName ? formatName(String(name)) : String(name))}
              axisLine={false}
              tickLine={false}
            />
                <ChartTooltip
                content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <span className="text-foreground font-medium">
                      {formatMinutesWithT(Number(value), t)} ({Number(item.payload?.visits ?? 0)}{t("visit_count_suffix")})
                    </span>
                  )}
                />
              }
            />
            <Bar dataKey="totalMin" name={inputTimeLabel} radius={[0, 4, 4, 0]} barSize={18}>
              {data.map((entry, idx) => {
                const ratio = entry.totalMin / maxVal
                const opacity = 0.35 + ratio * 0.65
                return <Cell key={idx} fill={color} fillOpacity={opacity} />
              })}
              <LabelList
                dataKey="totalMin"
                position="right"
                content={({ x, y, width, height, value, index }) => {
                  const entry = data[index ?? 0]
                  if (entry == null || value == null || x == null || y == null || width == null || height == null) {
                    return null
                  }
                  const label = `${formatMinutesWithT(Number(value), t)} (${entry.visits}${t("visit_count_suffix")})`
                  return (
                    <text
                      x={Number(x) + Number(width) + 4}
                      y={Number(y) + Number(height) / 2}
                      fill="hsl(220, 8%, 46%)"
                      fontSize={11}
                      dominantBaseline="middle"
                    >
                      {label}
                    </text>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}
