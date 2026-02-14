"use client"

import { Card, CardContent } from "@/components/ui/card"

interface AdminPlaceholderProps {
  title: string
  description?: string
}

export function AdminPlaceholder({ title, description }: AdminPlaceholderProps) {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <Card>
          <CardContent className="flex min-h-[200px] flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-lg">준비 중입니다</p>
            <p className="mt-1 text-sm">다음 단계에서 구현됩니다</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
