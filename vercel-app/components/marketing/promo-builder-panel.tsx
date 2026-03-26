import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PromoBuilderPanelProps = {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

export function PromoBuilderPanel({
  title,
  description,
  action,
  className,
  contentClassName,
  children,
}: PromoBuilderPanelProps) {
  return (
    <Card className={cn("rounded-xl", className)}>
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
          {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <CardContent className={cn("flex flex-col gap-4 p-6", contentClassName)}>{children}</CardContent>
    </Card>
  )
}
