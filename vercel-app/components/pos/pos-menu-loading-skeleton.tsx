'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PosMenuLoadingSkeletonProps {
  className?: string
  tileCols?: number
  hint?: string
}

export function PosMenuLoadingSkeleton({
  className,
  tileCols = 4,
  hint,
}: PosMenuLoadingSkeletonProps) {
  const cols = Math.max(2, tileCols)
  const tileCount = cols * 3

  return (
    <div
      className={cn('flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-3', className)}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`cat-${i}`} className="h-8 w-16 shrink-0 rounded-lg" />
        ))}
      </div>
      <div
        className="grid flex-1 auto-rows-[162px] gap-2.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: tileCount }).map((_, i) => (
          <div key={`tile-${i}`} className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-1.5">
            <Skeleton className="h-[92px] w-full rounded-lg" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
      {hint ? <p className="text-center text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
