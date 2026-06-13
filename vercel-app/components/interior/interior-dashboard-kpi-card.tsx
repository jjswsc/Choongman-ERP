"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type InteriorDashboardKpiCardProps = {
  label: string
  value: number
  icon: LucideIcon
  href?: string
  cta?: string
  warn?: boolean
  danger?: boolean
}

export function InteriorDashboardKpiCard({
  label,
  value,
  icon: Icon,
  href,
  cta,
  warn,
  danger,
}: InteriorDashboardKpiCardProps) {
  const inner = (
    <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {href && cta ? (
        <p className="mt-2 text-[11px] font-medium text-primary">{cta} →</p>
      ) : null}
    </>
  )

  const className = cn(
    "rounded-lg border p-3 shadow-sm transition-colors",
    danger && value > 0 ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10" : "",
    warn && value > 0 && !danger ? "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10" : "",
    !warn && !danger ? "bg-card" : "",
    href ? "cursor-pointer" : ""
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }

  return <div className={className}>{inner}</div>
}
