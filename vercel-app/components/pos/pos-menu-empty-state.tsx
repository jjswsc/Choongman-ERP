'use client'

import { UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PosMenuEmptyStateProps {
  message: string
  className?: string
}

export function PosMenuEmptyState({ message, className }: PosMenuEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <UtensilsCrossed className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
