"use client"

import { Card, CardContent } from "@/components/ui/card"

interface AdminPlaceholderProps {
  title: string
}

export function AdminPlaceholder({ title }: AdminPlaceholderProps) {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{title}</h1>
      <Card>
        <CardContent className="flex min-h-[200px] flex-col items-center justify-center py-12 text-slate-500">
          <p className="text-lg">준비 중입니다</p>
          <p className="mt-1 text-sm">다음 단계에서 구현됩니다</p>
        </CardContent>
      </Card>
    </div>
  )
}
