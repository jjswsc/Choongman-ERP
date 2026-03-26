import * as React from "react"
import { Card } from "@/components/ui/card"

type PromoSearchListPanelProps = {
  header: React.ReactNode
  children: React.ReactNode
}

export function PromoSearchListPanel({ header, children }: PromoSearchListPanelProps) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-xl">
      <div className="border-b px-4 py-3 sm:px-6 sm:py-4">{header}</div>
      {children}
    </Card>
  )
}
