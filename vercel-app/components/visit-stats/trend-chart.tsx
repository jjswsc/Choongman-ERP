"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatMinutes } from "@/lib/visit-data"

type TrendChartProps = {
  data: { week: string; totalMin: number; visits: number }[]
}

export function TrendChart({ data }: TrendChartProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const uid = React.useId().replace(/:/g, "")
  const gradTime = `gradTime-${uid}`
  const gradVisits = `gradVisits-${uid}`
  const inputTimeLabel = t("visit_trend_input_time")
  const visitsLabel = t("visit_trend_visits")
  const chartConfig = {
    totalMin: { label: inputTimeLabel, color: "#2563eb" },
    visits: { label: visitsLabel, color: "#059669" },
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">{t("visit_trend_title")}</h3>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#2563eb" }} />
            {inputTimeLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#059669" }} />
            {visitsLabel}
          </span>
        </div>
      </div>
      <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradTime} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={gradVisits} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: "hsl(220, 8%, 46%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="time"
              tick={{ fontSize: 11, fill: "hsl(220, 8%, 46%)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 11, fill: "hsl(220, 8%, 46%)" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="text-foreground font-medium">
                      {name === inputTimeLabel ? formatMinutes(Number(value)) : `${value}${t("visit_count_suffix")}`}
                    </span>
                  )}
                />
              }
            />
            <Area
              yAxisId="time"
              type="monotone"
              dataKey="totalMin"
              name={inputTimeLabel}
              stroke="#2563eb"
              strokeWidth={2}
              fill={`url(#${gradTime})`}
            />
            <Area
              yAxisId="count"
              type="monotone"
              dataKey="visits"
              name={visitsLabel}
              stroke="#059669"
              strokeWidth={2}
              fill={`url(#${gradVisits})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}
