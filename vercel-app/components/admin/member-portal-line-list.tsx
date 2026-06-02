"use client"

import * as React from "react"
import { ImageIcon, Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type MemberPortalLineListRow = {
  id: string
  imageUrl?: string
  title: string
  subtitle?: string
  placement?: string
  periodLabel?: string
  sortOrder?: number
  isActive: boolean
  toggling?: boolean
}

type MemberPortalLineListProps = {
  rows: MemberPortalLineListRow[]
  emptyMessage: string
  onToggleActive: (id: string) => void
  onEdit: (id: string) => void
  canEdit?: boolean
}

export function MemberPortalLineList({
  rows,
  emptyMessage,
  onToggleActive,
  onEdit,
  canEdit = true,
}: MemberPortalLineListProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="hidden border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_8rem_11rem_4rem_7rem] md:gap-3">
        <span>콘텐츠</span>
        <span>노출 위치</span>
        <span>기간</span>
        <span className="text-center">정렬</span>
        <span className="text-right">상태</span>
      </div>
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-3 px-4 py-3 transition hover:bg-muted/20 md:grid md:grid-cols-[minmax(0,1fr)_8rem_11rem_4rem_7rem] md:items-center md:gap-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => canEdit && onEdit(row.id)}
                  disabled={!canEdit}
                  className={cn(
                    "truncate text-left text-sm font-semibold",
                    canEdit ? "text-[#06c755] hover:underline" : "cursor-default text-foreground"
                  )}
                >
                  {row.title || "(제목 없음)"}
                </button>
                {row.subtitle ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.subtitle}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-2 md:hidden">
                  {row.placement ? (
                    <span className="text-[11px] text-muted-foreground">{row.placement}</span>
                  ) : null}
                  {row.periodLabel ? (
                    <span className="text-[11px] text-muted-foreground">{row.periodLabel}</span>
                  ) : null}
                </div>
              </div>
              {canEdit ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 md:hidden"
                  onClick={() => onEdit(row.id)}
                  aria-label="편집"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <p className="hidden text-xs text-muted-foreground md:block">{row.placement || "—"}</p>
            <p className="hidden text-xs leading-snug text-muted-foreground md:block">{row.periodLabel || "—"}</p>
            <p className="hidden text-center text-xs text-muted-foreground md:block">{row.sortOrder ?? 0}</p>

            <div className="flex items-center justify-end gap-2">
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="hidden md:inline-flex"
                  onClick={() => onEdit(row.id)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  편집
                </Button>
              ) : null}
              {canEdit ? (
                <button
                  type="button"
                  disabled={row.toggling}
                  onClick={() => onToggleActive(row.id)}
                  className={cn(
                    "inline-flex min-w-[5.5rem] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    row.isActive
                      ? "border-[#06c755] bg-[#06c755]/10 text-[#06c755] hover:bg-[#06c755]/15"
                      : "border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {row.toggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : row.isActive ? (
                    "사용 중"
                  ) : (
                    "중지"
                  )}
                </button>
              ) : (
                <span
                  className={cn(
                    "inline-flex min-w-[5.5rem] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold",
                    row.isActive
                      ? "border-[#06c755]/30 bg-[#06c755]/5 text-[#06c755]"
                      : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                  )}
                >
                  {row.isActive ? "사용 중" : "중지"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
