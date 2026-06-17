"use client"

import * as React from "react"
import { Copy, Eye, ImageIcon, Loader2, Pencil, Power, Search, Trash2 } from "lucide-react"
import { MemberPortalContentImagePreview } from "@/components/admin/member-portal-content-image-preview"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  formatMemberPortalAdminPeriod,
  formatMemberPortalAdminUpdatedAt,
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
import { useLang } from "@/lib/lang-context"
import type { LangCode } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<string, string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-700",
  scheduled: "border-sky-200 bg-sky-50 text-sky-700",
  expired: "border-muted-foreground/20 bg-muted/50 text-muted-foreground",
  paused: "border-amber-200 bg-amber-50 text-amber-800",
}

const CATEGORY_STYLE: Record<string, string> = {
  promo: "border-violet-200 bg-violet-50 text-violet-700",
  new_menu: "border-orange-200 bg-orange-50 text-orange-700",
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

function formatUpdatedAt(raw: string, lang: LangCode): string {
  return formatMemberPortalAdminUpdatedAt(raw, lang)
}

function ActionIconButton({
  label,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn("h-8 w-8 shrink-0", className)}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
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
  const { lang } = useLang()
  const t = useT(lang)
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<ContentAdminStatusFilter>("all")
  const [sort, setSort] = React.useState<ContentAdminSort>("sort_order")
  const [previewItem, setPreviewItem] = React.useState<MemberPortalContentAdminItem | null>(null)

  const filtered = React.useMemo(() => {
    let rows = searchContentAdminItems(items, search, t)
    rows = rows.filter((item) => {
      if (statusFilter === "all") return true
      return resolveMemberPortalContentDisplayStatus(item) === statusFilter
    })
    return sortContentAdminItems(rows, sort)
  }, [items, search, sort, statusFilter, t])

  const summary = React.useMemo(() => summarizeContentAdminItems(items), [items])

  const statusFilters: Array<{ id: ContentAdminStatusFilter; label: string; count: number }> = [
    { id: "all", label: t("all"), count: summary.total },
    { id: "live", label: t("mpAdmin_statusLive"), count: summary.live },
    { id: "scheduled", label: t("mpAdmin_statusScheduled"), count: summary.scheduled },
    { id: "expired", label: t("mpAdmin_statusExpired"), count: summary.expired },
    { id: "paused", label: t("mpAdmin_statusPaused"), count: summary.paused },
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
            placeholder={t("mpAdmin_searchPh")}
            className="pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ContentAdminSort)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="sort_order">{t("mpAdmin_sortSortOrder")}</option>
          <option value="updated_desc">{t("mpAdmin_sortUpdated")}</option>
          <option value="starts_desc">{t("mpAdmin_sortStarts")}</option>
          <option value="title">{t("mpAdmin_sortTitle")}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-14 text-center text-sm text-muted-foreground">
          {items.length === 0 ? emptyMessage : t("mpAdmin_noFilterMatch")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.05fr)_4.75rem_5.25rem_minmax(7rem,8.25rem)_2.25rem_minmax(4.25rem,4.75rem)_auto] lg:gap-2 xl:gap-3">
            <span>{t("mpAdmin_colContent")}</span>
            <span>{t("mpAdmin_colType")}</span>
            <span>{t("mpAdmin_colStatus")}</span>
            <span>{t("mpAdmin_colPeriod")}</span>
            <span className="text-center">{t("mpAdmin_colSort")}</span>
            <span>{t("mpAdmin_colUpdated")}</span>
            <span className="text-right">{t("mpAdmin_colActions")}</span>
          </div>
          <TooltipProvider delayDuration={200}>
          <ul className="divide-y">
            {filtered.map((item) => {
              const category = memberPortalContentAdminCategory(item)
              const status = resolveMemberPortalContentDisplayStatus(item)
              const periodLabel = formatMemberPortalAdminPeriod(item.startsAt, item.endsAt, t, lang)
              const placement = memberPortalContentPlacementLabel(item.targetTab, item.contentType, t)
              const toggling = togglingKey === item.contentKey
              const deleting = deletingKey === item.contentKey

              return (
                <li
                  key={item.contentKey}
                  className="flex flex-col gap-3 px-4 py-3 transition hover:bg-muted/20 lg:grid lg:grid-cols-[minmax(0,1.05fr)_4.75rem_5.25rem_minmax(7rem,8.25rem)_2.25rem_minmax(4.25rem,4.75rem)_auto] lg:items-center lg:gap-2 xl:gap-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
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
                        {item.title || t("mpAdmin_noTitle")}
                      </button>
                      {item.body ? (
                        <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-muted-foreground lg:hidden">{item.body}</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground/70 lg:hidden">{t("mpAdmin_noBody")}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 lg:hidden">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            CATEGORY_STYLE[category]
                          )}
                        >
                          {memberPortalContentAdminCategoryLabel(category, t)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            STATUS_STYLE[status]
                          )}
                        >
                          {memberPortalContentDisplayStatusLabel(status, t)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{placement}</span>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground/80 lg:hidden">
                        {periodLabel} · {tr(t, "mpAdmin_sortInline", { order: String(item.sortOrder) })}
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
                        ? memberPortalContentAdminCategoryLabel(category, t)
                        : memberPortalContentAdminCategoryLabel(category, t, true)}
                    </span>
                  </div>

                  <div className="hidden lg:block">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        STATUS_STYLE[status]
                      )}
                    >
                      {memberPortalContentDisplayStatusLabel(status, t)}
                    </span>
                  </div>

                  <p className="hidden text-xs leading-snug text-muted-foreground lg:block">{periodLabel}</p>
                  <p className="hidden text-center text-xs text-muted-foreground lg:block">{item.sortOrder}</p>
                  <div className="hidden text-xs text-muted-foreground lg:block">
                    <p>{formatUpdatedAt(item.updatedAt, lang)}</p>
                    {item.updatedBy ? <p className="mt-0.5 truncate text-[10px]">{item.updatedBy}</p> : null}
                  </div>

                  <div className="flex shrink-0 flex-nowrap items-center justify-end gap-0.5">
                    <ActionIconButton label={t("mpAdmin_preview")} onClick={() => setPreviewItem(item)}>
                      <Eye className="h-4 w-4" />
                    </ActionIconButton>
                    {canEdit ? (
                      <>
                        <ActionIconButton label={t("mpAdmin_edit")} onClick={() => onEdit(item.contentKey)}>
                          <Pencil className="h-4 w-4" />
                        </ActionIconButton>
                        {onDuplicate ? (
                          <ActionIconButton label={t("mpAdmin_duplicate")} onClick={() => onDuplicate(item.contentKey)}>
                            <Copy className="h-4 w-4" />
                          </ActionIconButton>
                        ) : null}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              disabled={toggling}
                              onClick={() => onToggleActive(item.contentKey)}
                              aria-label={item.isActive ? t("mpAdmin_active") : t("mpAdmin_statusPaused")}
                              className={cn(
                                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
                                item.isActive
                                  ? "border-[#06c755] bg-[#06c755]/10 text-[#06c755] hover:bg-[#06c755]/15"
                                  : "border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {toggling ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Power className="h-4 w-4" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {item.isActive ? t("mpAdmin_active") : t("mpAdmin_statusPaused")}
                          </TooltipContent>
                        </Tooltip>
                        {onDelete ? (
                          <ActionIconButton
                            label={t("delete")}
                            disabled={deleting}
                            onClick={() => onDelete(item.contentKey)}
                            className="text-destructive hover:text-destructive"
                          >
                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </ActionIconButton>
                        ) : null}
                      </>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                              item.isActive
                                ? "border-[#06c755]/30 bg-[#06c755]/5 text-[#06c755]"
                                : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                            )}
                          >
                            <Power className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {item.isActive ? t("mpAdmin_active") : t("mpAdmin_statusPaused")}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          </TooltipProvider>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {tr(t, "mpAdmin_listFooter", { count: String(filtered.length) })}
      </p>

      <Dialog open={!!previewItem} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {previewItem ? (
            <>
              <DialogHeader>
                <DialogTitle>{previewItem.title || t("mpAdmin_preview")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {previewItem.imageUrl ? (
                  <MemberPortalContentImagePreview
                    category={memberPortalContentAdminCategory(previewItem)}
                    imageUrl={previewItem.imageUrl}
                    title={previewItem.title}
                    body={previewItem.body}
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", CATEGORY_STYLE[memberPortalContentAdminCategory(previewItem)])}>
                    {memberPortalContentAdminCategoryLabel(memberPortalContentAdminCategory(previewItem), t)}
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[resolveMemberPortalContentDisplayStatus(previewItem)])}>
                    {memberPortalContentDisplayStatusLabel(resolveMemberPortalContentDisplayStatus(previewItem), t)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {memberPortalContentPlacementLabel(previewItem.targetTab, previewItem.contentType, t)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMemberPortalAdminPeriod(previewItem.startsAt, previewItem.endsAt, t, lang)}
                </p>
                {previewItem.body ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{previewItem.body}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("mpAdmin_noBody")}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {t("mpAdmin_keyLabel")}: {previewItem.contentKey}
                  {previewItem.updatedBy ? ` · ${previewItem.updatedBy}` : ""}
                  {previewItem.updatedAt ? ` · ${formatUpdatedAt(previewItem.updatedAt, lang)}` : ""}
                </p>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
