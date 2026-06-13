"use client"

import * as React from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const toneValueClass: Record<string, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  primary: "text-primary",
  danger: "text-rose-600 dark:text-rose-400",
}

export function CrmPageHero({
  icon: Icon,
  title,
  description,
  actions,
  gradient = "from-indigo-50 to-violet-50",
  border = "border-indigo-200/60",
  iconClass = "bg-indigo-500/10 text-indigo-600",
}: {
  icon: LucideIcon
  title: string
  description?: string
  actions?: React.ReactNode
  gradient?: string
  border?: string
  iconClass?: string
}) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-r px-5 py-4", border, gradient)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("rounded-xl p-2", iconClass)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
            {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

export function CrmKpiCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  href,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: keyof typeof toneValueClass
  onClick?: () => void
  href?: string
}) {
  const inner = (
    <>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", toneValueClass[tone] || toneValueClass.default)}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  )
  const className = cn(
    "rounded-xl border bg-card p-4 shadow-sm text-left transition",
    (onClick || href) && "cursor-pointer hover:border-primary/40 hover:shadow-md"
  )
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    )
  }
  return <div className={className}>{inner}</div>
}

export function CrmMemberLink({
  memberId,
  name,
  memberNo,
  className,
}: {
  memberId: number
  name?: string
  memberNo?: string
  className?: string
}) {
  const label = name?.trim() || memberNo?.trim() || `#${memberId}`
  return (
    <Link
      href={`/admin/members?memberId=${memberId}`}
      className={cn("font-medium text-primary underline-offset-4 hover:underline", className)}
    >
      {label}
    </Link>
  )
}

export function CrmSegmentBadge({ count, loading }: { count?: number; loading?: boolean }) {
  if (loading) return <span className="ml-1 text-[10px] text-muted-foreground">…</span>
  if (count == null) return null
  return (
    <span className="ml-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1 ring-border">
      {count.toLocaleString()}
    </span>
  )
}

export function CrmActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>
}

export function CrmOutlineButton(props: React.ComponentProps<typeof Button>) {
  return <Button variant="outline" size="sm" {...props} />
}
