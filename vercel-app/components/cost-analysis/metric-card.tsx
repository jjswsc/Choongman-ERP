"use client"

import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string
  subLabel?: string
  variant?: "default" | "primary" | "accent" | "success" | "warning"
  size?: "sm" | "md" | "lg"
  icon?: React.ReactNode
}

export function MetricCard({
  label,
  value,
  subLabel,
  variant = "default",
  size = "md",
  icon,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-xl border border-border p-4 transition-all duration-200 hover:border-primary/30",
        size === "lg" && "p-6",
        size === "sm" && "p-3",
        variant === "default" && "bg-card",
        variant === "primary" && "bg-primary/10 border-primary/20",
        variant === "accent" && "bg-accent/10 border-accent/20",
        variant === "success" && "bg-chart-1/10 border-chart-1/20",
        variant === "warning" && "bg-chart-2/10 border-chart-2/20"
      )}
    >
      <div
        className={cn(
          "absolute top-0 right-0 h-20 w-20 rounded-bl-full opacity-5",
          variant === "primary" && "bg-primary",
          variant === "accent" && "bg-accent",
          variant === "success" && "bg-chart-1",
          variant === "warning" && "bg-chart-2",
          variant === "default" && "bg-foreground"
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 font-mono font-bold text-foreground",
              size === "lg" && "text-2xl",
              size === "md" && "text-xl",
              size === "sm" && "text-lg"
            )}
          >
            {value}
          </p>
          {subLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subLabel}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "rounded-lg p-2",
              variant === "primary" && "bg-primary/20 text-primary",
              variant === "accent" && "bg-accent/20 text-accent",
              variant === "success" && "bg-chart-1/20 text-chart-1",
              variant === "warning" && "bg-chart-2/20 text-chart-2",
              variant === "default" && "bg-muted text-muted-foreground"
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
