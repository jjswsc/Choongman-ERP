"use client"

import * as React from "react"
import { Copy, Eye, ImageIcon, Loader2, Pencil, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  formatMemberPortalAdminPeriod,
  memberPortalContentAdminCategory,
  memberPortalContentAdminCategoryLabel,
  memberPortalContentDisplayStatusLabel,
  memberPortalContentPlacementLabel,
  resolveMemberPortalContentDisplayStatus,
  searchContentAdminItems,
  sortContentAdminItems,
  summarizeContentAdminItems,
  type ContentAdminSort,
  type ContentAdminStatusFilter,
  type MemberPortalContentAdminItem,
  type MemberPortalContentAdminTab,
} from "@/lib/member-portal-content-admin"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<string, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  expired: "border-muted-foreground/20 bg-muted/50 text-muted-foreground",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
}

const CATEGORY_STYLE: Record<string, string> = {
  promo: "border-violet-200 bg-violet-50 text-violet-700",
  popup: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
  info: "border-slate-200 bg-slate-50 text-slate-700",
  other: "border-muted-foreground/20 bg-muted/40 text-muted-foreground",
}

type MemberPortalContentAdminListProps = {
  variant: MemberPortalContentAdminTab
  items: MemberPortalContentAdminItem[]
  emptyMessage: string
  canEdit?: boolean
  togglingKey?: string | null
  deletingKey?: string | null
  onToggleActive: (contentKey: string) => void
  onEdit: (contentKey: string) => void
  onDuplicate?: (contentKey: string) => void
  onDelete?: (contentKey: string) => void
}

function formatUpdatedAt(raw: string): string {
  const v = String(raw || "").trim()
  if (!v) return "—"
  const normalized = v.includes("T") ? v : v.replace(" ", "T")
  const d = new Date(normalized.length <= 16 ? `${normalized}:00+07:00` : normalized)
  if (Number.isNaN(d.getTime())) return v.slice(0, 16)
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Bangkok",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export function MemberPortalContentAdminList({
  variant,
  items,
  emptyMessage,
  canEdit = true,
  togglingKey,
  deletingKey,
  onToggleActive,
  onEdit,
  onDuplicate,
  onDelete,
}: MemberPortalContentAdminListProps) {
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<ContentAdminStatusFilter>("all")
  const [sort, setSort] = React.useState<ContentAdminSort>("sort_order")
  const [previewItem, setPreviewItem] = React.useState<MemberPortalContentAdminItem | null>(null)

  const filtered = React.useMemo(() => {
    let rows = searchContentAdminItems(items, search)
    rows = rows.filter((item) => {
      if (statusFilter === "all") return true
      return resolveMemberPortalContentDisplayStatus(item) === statusFilter
    })
    return sortContentAdminItems(rows, sort)
  }, [items, search, sort, statusFilter])

  const summary = React.useMemo(() => summarizeContentAdminItems(items), [items])

  const statusFilters: Array<{ id: ContentAdminStatusFilter; label: string; count: number }> = [
    { id: "all", label: "전체", count: summary.total },
    { id: "live", label: "노출 중", count: summary.live },
    { id: "scheduled", label: "예정", count: summary.scheduled },
    { id: "expired", label: "종료", count: summary.expired },
    { id: "paused", label: "중지", count: summary.paused },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {statusFilters.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setStatusFilter(chip.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition",
              statusFilter === chip.id ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/40"
            )}
          >
            <p className="text-[11px] text-muted-foreground">{chip.label}</p>
            <p className="text-lg font-semibold tabular-nums">{chip.count}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="제목·본문·키워드 검색"
            className="pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ContentAdminSort)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="sort_order">정렬순서</option>
          <option value="updated_desc">최근 수정</option>
          <option value="starts_desc">시작일 최신</option>
          <option value="title">제목순</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
          {items.length === 0 ? emptyMessage : "검색·필터 조건에 맞는 항목이 없습니다."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.6fr)_5.5rem_6.5rem_9rem_3rem_5.5rem_7rem] lg:gap-3">
            <span>콘텐츠</span>
            <span>유형</span>
            <span>상태</span>
            <span>노출 기간</span>
            <span className="text-center">정렬</span>
            <span>수정</span>
            <span className="text-right">작업</span>
          </div>
          <ul className="divide-y">
            {filtered.map((item) => {
              const category = memberPortalContentAdminCategory(item)
              const status = resolveMemberPortalContentDisplayStatus(item)
              const periodLabel = formatMemberPortalAdminPeriod(item.startsAt, item.endsAt)
              const placement = memberPortalContentPlacementLabel(item.targetTab, item.contentType)
              const toggling = togglingKey === item.contentKey
              const deleting = deletingKey === item.contentKey

              return (
                <li
                  key={item.contentKey}
                  className="flex flex-col gap-3 px-4 py-3 transition hover:bg-muted/20 lg:grid lg:grid-cols-[minmax(0,1.6fr)_5.5rem_6.5rem_9rem_3rem_5.5rem_7rem] lg:items-center lg:gap-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => canEdit && onEdit(item.contentKey)}
                        disabled={!canEdit}
                        className={cn(
                          "line-clamp-1 text-left text-sm font-semibold",
                          canEdit ? "text-[#06c755] hover:underline" : "cursor-default text-foreground"
                        )}
                      >
                        {item.title || "(제목 없음)"}
                      </button>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground/70">본문 없음</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            CATEGORY_STYLE[category]
                          )}
                        >
                          {memberPortalContentAdminCategoryLabel(category)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            STATUS_STYLE[status]
                          )}
                        >
                          {memberPortalContentDisplayStatusLabel(status)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{placement}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground/80 lg:hidden">
                        {periodLabel} · 정렬 {item.sortOrder}
                        {item.updatedBy ? ` · ${item.updatedBy}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        CATEGORY_STYLE[category]
                      )}
                    >
                      {variant === "all"
                        ? memberPortalContentAdminCategoryLabel(category)
                        : memberPortalContentAdminCategoryLabel(category).replace("월별 ", "")}
                    </span>
                  </div>

                  <div className="hidden lg:block">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLE[status]
                      )}
                    >
                      {memberPortalContentDisplayStatusLabel(status)}
                    </span>
                  </div>

                  <p className="hidden text-xs leading-snug text-muted-foreground lg:block">{periodLabel}</p>
                  <p className="hidden text-center text-xs text-muted-foreground lg:block">{item.sortOrder}</p>
                  <div className="hidden text-xs text-muted-foreground lg:block">
                    <p>{formatUpdatedAt(item.updatedAt)}</p>
                    {item.updatedBy ? <p className="mt-0.5 truncate text-[10px]">{item.updatedBy}</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewItem(item)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      미리보기
                    </Button>
                    {canEdit ? (
                      <>
                        <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(item.contentKey)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          편집
                        </Button>
                        {onDuplicate ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => onDuplicate(item.contentKey)}>
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            복제
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          disabled={toggling}
                          onClick={() => onToggleActive(item.contentKey)}
                          className={cn(
                            "inline-flex min-w-[4.75rem] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                            item.isActive
                              ? "border-[#06c755] bg-[#06c755]/10 text-[#06c755] hover:bg-[#06c755]/15"
                              : "border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.isActive ? "사용 중" : "중지"}
                        </button>
                        {onDelete ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deleting}
                            onClick={() => onDelete(item.contentKey)}
                            aria-label="삭제"
                          >
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex min-w-[4.75rem] items-center justify-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          item.isActive
                            ? "border-[#06c755]/30 bg-[#06c755]/5 text-[#06c755]"
                            : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                        )}
                      >
                        {item.isActive ? "사용 중" : "중지"}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        총 {filtered.length}건 표시 · 방콕 시간 기준 노출 상태 · 정렬순서가 작을수록 회원앱에서 먼저 노출됩니다.
      </p>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {previewItem ? (
            <>
              <DialogHeader>
                <DialogTitle>{previewItem.title || "미리보기"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {previewItem.imageUrl ? (
                  <img
                    src={previewItem.imageUrl}
                    alt=""
                    className="max-h-56 w-full rounded-lg border object-cover"
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", CATEGORY_STYLE[memberPortalContentAdminCategory(previewItem)])}>
                    {memberPortalContentAdminCategoryLabel(memberPortalContentAdminCategory(previewItem))}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[resolveMemberPortalContentDisplayStatus(previewItem)])}>
                    {memberPortalContentDisplayStatusLabel(resolveMemberPortalContentDisplayStatus(previewItem))}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {memberPortalContentPlacementLabel(previewItem.targetTab, previewItem.contentType)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMemberPortalAdminPeriod(previewItem.startsAt, previewItem.endsAt)}
                </p>
                {previewItem.body ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{previewItem.body}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">본문 없음</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  키: {previewItem.contentKey}
                  {previewItem.updatedBy ? ` · ${previewItem.updatedBy}` : ""}
                  {previewItem.updatedAt ? ` · ${formatUpdatedAt(previewItem.updatedAt)}` : ""}
                </p>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
