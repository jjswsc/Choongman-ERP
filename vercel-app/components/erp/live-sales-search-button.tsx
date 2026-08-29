"use client"

import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 실시간 매출「검색」— 눌림감·터치 반응 강조 (세무 조회 버튼과 동일 계열) */
export const LIVE_SALES_SEARCH_BTN_CLASS = cn(
  "h-9 min-w-[5.5rem] gap-1.5 font-semibold shadow-sm touch-manipulation",
  "transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
  "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
  "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
)

type LiveSalesSearchButtonProps = {
  onClick: () => void | Promise<void>
  label: string
  title?: string
  /** 조회 중 아이콘 펄스만 — 백그라운드 로딩으로 클릭을 막지 않음 */
  busy?: boolean
  className?: string
  size?: "sm" | "default"
}

export function LiveSalesSearchButton({
  onClick,
  label,
  title,
  busy = false,
  className,
  size = "sm",
}: LiveSalesSearchButtonProps) {
  return (
    <Button
      type="button"
      variant="default"
      size={size}
      className={cn(LIVE_SALES_SEARCH_BTN_CLASS, className)}
      onClick={() => {
        void onClick()
      }}
      aria-busy={busy}
      title={title ?? label}
    >
      <Search className={cn("h-4 w-4", busy && "animate-pulse")} aria-hidden />
      {label}
    </Button>
  )
}
