"use client"

import * as React from "react"
import { ExternalLink, FileText, FileUp, Link2, Pencil, Stamp, Trash2 } from "lucide-react"
import { canShowCompanyHybridWatermarkAction } from "@/components/erp/company-hybrid-documents/document-watermark-dialog"
import type { CompanyHybridDocumentEvent, CompanyHybridDocumentListItem } from "@/lib/api-client"
import { getCompanyHybridDocumentEvents } from "@/lib/api-client"
import { formatCompanyHybridDocDateForInput, companyHybridDocVisibilityFromDocType } from "@/lib/company-hybrid-documents"
import { documentHasCorrespondence, getCorrespondenceFromMetadata } from "@/lib/company-hybrid-correspondence"
import { labelCompanyHybridRelatedType } from "@/lib/company-hybrid-documents-related"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CompanyHybridDocumentExpiryBadge } from "@/components/erp/company-hybrid-documents/document-expiry-badge"
import { formatFileSize, formatHybridDocumentCreatedAt } from "@/components/erp/company-hybrid-documents/shared"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: CompanyHybridDocumentListItem | null
  t: (key: string) => string
  labelCategory: (row: CompanyHybridDocumentListItem) => string
  labelVisibility: (row: CompanyHybridDocumentListItem) => string
  labelStore: (store: string) => string
  labelCorrDirection: (d: string | undefined) => string
  labelCorrStatus: (s: string | undefined) => string
  canMutate: boolean
  onOpenUrl: (row: CompanyHybridDocumentListItem) => void
  onIssueWatermark: (row: CompanyHybridDocumentListItem) => void
  onEdit: (row: CompanyHybridDocumentListItem) => void
  onDelete: (row: CompanyHybridDocumentListItem) => void
  onUnauthorized: (httpStatus: number) => boolean
  eventsRefreshKey?: number
}

function auditActionLabel(
  action: string,
  detail: Record<string, unknown> | null | undefined,
  t: (key: string) => string
): string {
  if (action === "view" && detail && String(detail.kind || "") === "watermark_issue") {
    return t("companyHybridDocAuditActionWatermark")
  }
  if (action === "create") return t("companyHybridDocAuditActionCreate")
  if (action === "update") return t("companyHybridDocAuditActionUpdate")
  if (action === "delete") return t("companyHybridDocAuditActionDelete")
  if (action === "view") return t("companyHybridDocAuditActionView")
  return action
}

function MetaField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{label}</dt>
      <dd className="break-words text-sm leading-snug text-foreground">{children}</dd>
    </div>
  )
}

export function CompanyHybridDocumentDetailSheet({
  open,
  onOpenChange,
  row,
  t,
  labelCategory,
  labelVisibility,
  labelStore,
  labelCorrDirection,
  labelCorrStatus,
  canMutate,
  onOpenUrl,
  onIssueWatermark,
  onEdit,
  onDelete,
  onUnauthorized,
  eventsRefreshKey = 0,
}: Props) {
  const [events, setEvents] = React.useState<CompanyHybridDocumentEvent[]>([])
  const [eventsLoading, setEventsLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open || !row?.id) {
      setEvents([])
      return
    }
    let cancelled = false
    setEventsLoading(true)
    void getCompanyHybridDocumentEvents({ documentId: row.id }).then((res) => {
      if (cancelled) return
      if (onUnauthorized(res.httpStatus)) return
      setEvents(res.success ? res.list || [] : [])
      setEventsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, row?.id, onUnauthorized, eventsRefreshKey])

  const corr = row ? getCorrespondenceFromMetadata(row.metadata) : null
  const hasCorr = row ? documentHasCorrespondence(row.metadata) : false

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetHeader className="shrink-0 gap-3 border-b bg-muted/20 px-6 py-5 pr-14 text-left">
          <SheetTitle className="text-left text-base font-semibold leading-snug tracking-tight sm:text-lg">
            {row?.title || t("companyHybridDocDetailTitle")}
          </SheetTitle>
          {row ? (
            <div className="flex flex-wrap gap-1.5">
              <CompanyHybridDocumentExpiryBadge
                validTo={row.valid_to}
                labels={{
                  expiringSoon: t("companyHybridDocExpiryBadgeExpiringSoon"),
                  expired: t("companyHybridDocExpiryBadgeExpired"),
                }}
              />
              {companyHybridDocVisibilityFromDocType(row.doc_type) !== "all" ? (
                <Badge variant="outline" className="h-5 px-2 text-[10px] font-normal">
                  {labelVisibility(row)}
                </Badge>
              ) : null}
              {hasCorr ? (
                <Badge variant="secondary" className="h-5 px-2 text-[10px] font-normal">
                  {t("companyHybridCorrTab")}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>

        {row ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="space-y-5 px-6 py-5">
              <section className="rounded-xl border bg-card/80 p-4 shadow-sm">
                <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  <MetaField label={t("companyHybridDocFilterStore")}>{labelStore(row.store)}</MetaField>
                  <MetaField label={t("companyHybridDocColCategory")}>{labelCategory(row)}</MetaField>
                  <MetaField label={t("companyHybridDocColValidity")}>
                    {formatCompanyHybridDocDateForInput(row.valid_from) || "—"}
                    {row.valid_to ? ` ~ ${formatCompanyHybridDocDateForInput(row.valid_to)}` : ""}
                  </MetaField>
                  <MetaField label={t("companyHybridDocColCreated")}>
                    {formatHybridDocumentCreatedAt(row.created_at)}
                  </MetaField>
                  <MetaField label={t("companyHybridDocColCreatedBy")}>{row.created_by_name || "—"}</MetaField>
                  <MetaField label={t("companyHybridDocRelated")}>
                    {labelCompanyHybridRelatedType(row.related_type, t)}
                    {row.related_id ? ` · ${row.related_id}` : ""}
                  </MetaField>
                  {row.file_name ? (
                    <MetaField label={t("companyHybridDocColFile")} className="sm:col-span-2">
                      <span className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{row.file_name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          ({formatFileSize(row.file_size)})
                        </span>
                      </span>
                    </MetaField>
                  ) : null}
                  {row.note ? (
                    <MetaField label={t("companyHybridDocNote")} className="sm:col-span-2">
                      <span className="whitespace-pre-wrap text-muted-foreground">{row.note}</span>
                    </MetaField>
                  ) : null}
                </dl>
              </section>

              {hasCorr && corr ? (
                <section className="rounded-xl border bg-card/80 p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("companyHybridCorrTab")}
                  </p>
                  <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                    <MetaField label={t("companyHybridCorrDirection")}>
                      {labelCorrDirection(corr.direction)}
                    </MetaField>
                    <MetaField label={t("companyHybridCorrStatus")}>{labelCorrStatus(corr.status)}</MetaField>
                    <MetaField label={t("companyHybridCorrColCounterparty")} className="sm:col-span-2">
                      {corr.counterparty || "—"}
                    </MetaField>
                    <MetaField label={t("companyHybridCorrOfficialRef")}>{corr.officialRef || "—"}</MetaField>
                    <MetaField label={t("companyHybridCorrReplyDue")}>
                      {formatCompanyHybridDocDateForInput(corr.replyDue) || "—"}
                    </MetaField>
                  </dl>
                </section>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="h-9 gap-1.5 px-3" onClick={() => onOpenUrl(row)}>
                  {row.source === "drive" ? <Link2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                  {t("companyHybridDocOpen")}
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                </Button>
                {canShowCompanyHybridWatermarkAction(row) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => onIssueWatermark(row)}
                  >
                    <Stamp className="h-4 w-4" />
                    {t("companyHybridDocWatermarkIssue")}
                  </Button>
                ) : null}
                {canMutate ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 px-3"
                      onClick={() => onEdit(row)}
                    >
                      <Pencil className="h-4 w-4" />
                      {t("companyHybridDocEdit")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 gap-1.5 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(row)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("companyHybridDocDelete")}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <section className="mt-auto border-t bg-muted/15 px-6 py-5">
              <p className="mb-3 text-sm font-medium tracking-tight">{t("companyHybridDocAuditTitle")}</p>
              {eventsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>
              ) : events.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("companyHybridDocAuditEmpty")}
                </p>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg border bg-background/80 px-3 py-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium leading-tight">
                          {auditActionLabel(ev.action, ev.detail, t)}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatHybridDocumentCreatedAt(ev.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[ev.actor_name, ev.actor_store].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
