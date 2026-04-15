"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** 테이블 구성 탭과 동일: 왼쪽 컨트롤 묶음 + 오른쪽(저장 등) */
export function PosScreenConfigActionBar({
  left,
  right,
}: {
  left: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      {right != null ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{right}</div>
      ) : null}
    </div>
  )
}

/** 테이블 구성·POS 설정 공통 녹색 저장 버튼 */
export function PosScreenConfigEmeraldSaveButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      size="sm"
      className={cn("h-10 gap-1.5 bg-emerald-600 hover:bg-emerald-700", className)}
      {...props}
    />
  )
}
