import * as React from "react"
import { cn } from "@/lib/utils"

type PromoLineComposerPanelProps = {
  title: string
  className?: string
  /** 넓은 작업 영역(구성 메뉴 메인 패널) */
  expanded?: boolean
  children: React.ReactNode
}

export function PromoLineComposerPanel({ title, className, expanded, children }: PromoLineComposerPanelProps) {
  return (
    <div
      className={cn(
        expanded
          ? "rounded-xl border border-border bg-card p-4 shadow-sm min-h-[min(55vh,480px)] flex flex-col"
          : "rounded border border-dashed p-3",
        className
      )}
    >
      <h4 className={cn("font-semibold text-foreground", expanded ? "mb-3 text-sm" : "mb-2 text-xs")}>{title}</h4>
      <div className={cn(expanded && "min-h-0 flex-1 flex flex-col")}>{children}</div>
    </div>
  )
}
