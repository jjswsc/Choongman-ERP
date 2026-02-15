"use client"

import * as React from "react"
import { Tooltip, type TooltipProps } from "recharts"
import { cn } from "@/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label?: string
    icon?: React.ComponentType<{ className?: string }>
    color?: string
    theme?: { light?: string; dark?: string }
  }
>

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ReactElement
  }
>(({ id, className, config, children, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart-container
        ref={ref}
        id={chartId}
        className={cn("w-full", className)}
        {...props}
      >
        {children}
      </div>
    </ChartContext.Provider>
  )
})
ChartContainer.displayName = "ChartContainer"

const ChartTooltip = Tooltip

type ChartTooltipContentProps = {
  active?: boolean
  payload?: Array<{ name: string; value: number; dataKey?: string; color?: string; payload?: Record<string, unknown> }>
  label?: string
  formatter?: (value: unknown, name: string, item: { payload?: Record<string, unknown> }) => React.ReactNode
  className?: string
}

function ChartTooltipContent({ active, payload, label, formatter, className }: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null
  const content = formatter ? (
    payload.map((item, idx) => (
      <div key={idx} className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{item.name}</span>
        {formatter(item.value, item.name, { payload: item.payload })}
      </div>
    ))
  ) : (
    payload.map((item, idx) => (
      <div key={idx}>{`${item.name}: ${item.value}`}</div>
    ))
  )
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm shadow-md",
        className
      )}
    >
      {label && <p className="mb-1.5 font-medium">{label}</p>}
      <div className="flex flex-col gap-0.5">{content}</div>
    </div>
  )
}
ChartTooltipContent.displayName = "ChartTooltipContent"

export { ChartContainer, ChartTooltip, ChartTooltipContent }
