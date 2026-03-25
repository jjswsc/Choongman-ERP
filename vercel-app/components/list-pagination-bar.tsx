"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ListPaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  disabled,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (p: number) => void
  disabled?: boolean
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const canPrev = safePage > 1
  const canNext = safePage < totalPages
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <span className="text-xs text-muted-foreground">
        {total === 0 ? "0건" : `${from}–${to} / ${total}건`}
      </span>
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-[4rem] text-xs"
          disabled={disabled || !canPrev}
          onClick={() => onPageChange(safePage - 1)}
        >
          이전
        </Button>
        <span className="px-2 text-xs text-muted-foreground tabular-nums">
          {safePage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-[4rem] text-xs"
          disabled={disabled || !canNext}
          onClick={() => onPageChange(safePage + 1)}
        >
          다음
        </Button>
      </div>
    </div>
  )
}
