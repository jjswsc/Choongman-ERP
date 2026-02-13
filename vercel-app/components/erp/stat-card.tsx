"use client"

import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  trend?: {
    value: string
    isPositive: boolean
  }
  variant?: "default" | "primary" | "success" | "warning" | "destructive"
}

const variantStyles = {
  default: {
    icon: "bg-muted text-muted-foreground",
    value: "text-foreground",
  },
  primary: {
    icon: "bg-primary/10 text-primary",
    value: "text-primary",
  },
  success: {
    icon: "bg-success/10 text-success",
    value: "text-success",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    value: "text-warning",
  },
  destructive: {
    icon: "bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
}

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  variant = "default",
}: StatCardProps) {
  const styles = variantStyles[variant]

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-5 transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {title}
          </span>
          <span
            className={cn(
              "text-2xl font-bold tracking-tight",
              styles.value
            )}
          >
            {value}
          </span>
          {description && (
            <span className="text-[11px] text-muted-foreground">
              {description}
            </span>
          )}
          {trend && (
            <div className="flex items-center gap-1 pt-1">
              <span
                className={cn(
                  "text-xs font-semibold",
                  trend.isPositive ? "text-success" : "text-destructive"
                )}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}
              </span>
              <span className="text-[10px] text-muted-foreground">
                지난달 대비
              </span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
            styles.icon
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {/* Decorative accent */}
      <div
        className={cn(
          "absolute bottom-0 left-0 h-1 w-full transition-all",
          variant === "primary" && "bg-primary/20 group-hover:bg-primary/40",
          variant === "success" && "bg-success/20 group-hover:bg-success/40",
          variant === "warning" && "bg-warning/20 group-hover:bg-warning/40",
          variant === "destructive" && "bg-destructive/20 group-hover:bg-destructive/40",
          variant === "default" && "bg-border group-hover:bg-muted-foreground/20"
        )}
      />
    </div>
  )
}
