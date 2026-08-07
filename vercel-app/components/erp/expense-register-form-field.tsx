import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** 지출등록 폼 — 제목 위·칸 아래, 간격·타이포 통일 */
export function ExpenseRegisterField({
  label,
  children,
  className,
  hint,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
  hint?: React.ReactNode
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Label className="block text-xs font-medium leading-4 text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <div className="text-[11px] leading-snug text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

/** 한 줄에 여러 필드 — 열 정렬·여백 통일 */
export function ExpenseRegisterFieldRow({
  children,
  className,
  cols = "auto",
}: {
  children: React.ReactNode
  className?: string
  /** auto: 반응형 2~4열 / dense: 금액·세금처럼 짧은 칸 */
  cols?: "auto" | "dense" | "payee"
}) {
  return (
    <div
      className={cn(
        "grid gap-x-5 gap-y-4",
        cols === "dense" && "grid-cols-2 sm:grid-cols-4",
        cols === "payee" && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        cols === "auto" && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ExpenseRegisterSection({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-muted/10 px-4 py-3.5 space-y-4",
        className
      )}
    >
      {title ? (
        <div className="text-xs font-semibold tracking-tight text-foreground/80">{title}</div>
      ) : null}
      {children}
    </div>
  )
}
