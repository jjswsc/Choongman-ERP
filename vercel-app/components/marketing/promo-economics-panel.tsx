import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PromoEconomicsPanelProps = {
  title: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function PromoEconomicsPanel({ title, children, className }: PromoEconomicsPanelProps) {
  return (
    <Card className={cn("rounded-xl", className)}>
      <CardContent className="space-y-2 p-4">
        <h4 className="text-sm font-semibold">{title}</h4>
        {children}
      </CardContent>
    </Card>
  )
}
