"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type AdminTableSkeletonProps = {
  columns?: number
  rows?: number
  className?: string
}

export function AdminTableSkeleton({ columns = 6, rows = 8, className }: AdminTableSkeletonProps) {
  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="border-b bg-muted/30 px-5 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="flex items-center gap-4 px-5 py-3">
            {Array.from({ length: columns }).map((_, ci) => (
              <Skeleton
                key={ci}
                className={cn("h-4 flex-1", ci === 0 && "max-w-[4rem]", ci === columns - 1 && "max-w-[2rem]")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
