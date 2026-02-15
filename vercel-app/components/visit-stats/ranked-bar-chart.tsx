"use client"

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
import { formatMinutes } from "@/lib/visit-data"

type RankedBarChartProps = {
  title: string
  color: string
  data: { name: string; totalMin: number; visits: number }[]
}

export function RankedBarChart({ title, color, data }: RankedBarChartProps) {
  const chartConfig = {
    totalMin: {
      label: "투입시간 (분)",
      color,
    },
  }

  const maxVal = Math.max(...data.map((d) => d.totalMin), 1)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">
          {data.length}개 항목
        </span>
      </div>
      <ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 50, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 12, fill: "hsl(220, 13%, 40%)" }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name, item) => (
                    <span className="text-foreground font-medium">
                      {formatMinutes(Number(value))} ({Number(item.payload?.visits ?? 0)}건)
                    </span>
                  )}
                />
              }
            />
            <Bar dataKey="totalMin" name="투입시간" radius={[0, 4, 4, 0]} barSize={18}>
              {data.map((entry, idx) => {
                const ratio = entry.totalMin / maxVal
                const opacity = 0.35 + ratio * 0.65
                return <Cell key={idx} fill={color} fillOpacity={opacity} />
              })}
              <LabelList
                dataKey="totalMin"
                position="right"
                formatter={(v: number) => formatMinutes(v)}
                style={{ fontSize: 11, fill: "hsl(220, 8%, 46%)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}
