"use client"

import * as React from "react"
import { ExternalLink, FileUp, Link2, Pencil, Trash2 } from "lucide-react"
import type { CompanyHybridDocumentEvent, CompanyHybridDocumentListItem } from "@/lib/api-client"
import { getCompanyHybridDocumentEvents } from "@/lib/api-client"
import { formatCompanyHybridDocDateForInput, companyHybridDocVisibilityFromDocType } from "@/lib/company-hybrid-documents"
import { documentHasCorrespondence, getCorrespondenceFromMetadata } from "@/lib/company-hybrid-correspondence"
import { labelCompanyHybridRelatedType } from "@/lib/company-hybrid-documents-related"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { CompanyHybridDocumentExpiryBadge } from "@/components/erp/company-hybrid-documents/document-expiry-badge"
import { formatFileSize, formatHybridDocumentCreatedAt } from "@/components/erp/company-hybrid-documents/shared"

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
  onEdit: (row: CompanyHybridDocumentListItem) => void
  onDelete: (row: CompanyHybridDocumentListItem) => void
  onUnauthorized: (httpStatus: number) => boolean
}

function auditActionLabel(action: string, t: (key: string) => string): string {
  if (action === "create") return t("companyHybridDocAuditActionCreate")
  if (action === "update") return t("companyHybridDocAuditActionUpdate")
  if (action === "delete") return t("companyHybridDocAuditActionDelete")
  if (action === "view") return t("companyHybridDocAuditActionView")
  return action
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
  onEdit,
  onDelete,
  onUnauthorized,
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
  }, [open, row?.id, onUnauthorized])

  const corr = row ? getCorrespondenceFromMetadata(row.metadata) : null
  const hasCorr = row ? documentHasCorrespondence(row.metadata) : false

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-8 text-left leading-snug">{row?.title || t("companyHybridDocDetailTitle")}</SheetTitle>
        </SheetHeader>
        {row ? (
          <div className="mt-4 flex flex-1 flex-col gap-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <CompanyHybridDocumentExpiryBadge
                validTo={row.valid_to}
                labels={{
                  expiringSoon: t("companyHybridDocExpiryBadgeExpiringSoon"),
                  expired: t("companyHybridDocExpiryBadgeExpired"),
                }}
              />
              {companyHybridDocVisibilityFromDocType(row.doc_type) !== "all" ? (
                <Badge variant="outline">{labelVisibility(row)}</Badge>
              ) : null}
              {hasCorr ? <Badge variant="secondary">{t("companyHybridCorrTab")}</Badge> : null}
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t("companyHybridDocFilterStore")}</dt>
                <dd>{labelStore(row.store)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("companyHybridDocColCategory")}</dt>
                <dd>{labelCategory(row)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("companyHybridDocColValidity")}</dt>
                <dd>
                  {formatCompanyHybridDocDateForInput(row.valid_from) || "—"}
                  {row.valid_to ? ` ~ ${formatCompanyHybridDocDateForInput(row.valid_to)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("companyHybridDocColCreated")}</dt>
                <dd>{formatHybridDocumentCreatedAt(row.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("companyHybridDocColCreatedBy")}</dt>
                <dd>{row.created_by_name || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("companyHybridDocRelated")}</dt>
                <dd>
                  {labelCompanyHybridRelatedType(row.related_type, t)}
                  {row.related_id ? ` · ${row.related_id}` : ""}
                </dd>
              </div>
              {row.file_name ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{t("companyHybridDocColFile")}</dt>
                  <dd>
                    {row.file_name} ({formatFileSize(row.file_size)})
                  </dd>
                </div>
              ) : null}
              {row.note ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">{t("companyHybridDocNote")}</dt>
                  <dd className="whitespace-pre-wrap">{row.note}</dd>
                </div>
              ) : null}
            </dl>

            {hasCorr && corr ? (
              <>
                <Separator />
                <div>
                  <p className="mb-2 text-sm font-medium">{t("companyHybridCorrTab")}</p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("companyHybridCorrDirection")}</dt>
                      <dd>{labelCorrDirection(corr.direction)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("companyHybridCorrStatus")}</dt>
                      <dd>{labelCorrStatus(corr.status)}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">{t("companyHybridCorrColCounterparty")}</dt>
                      <dd>{corr.counterparty || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("companyHybridCorrOfficialRef")}</dt>
                      <dd>{corr.officialRef || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("companyHybridCorrReplyDue")}</dt>
                      <dd>{formatCompanyHybridDocDateForInput(corr.replyDue) || "—"}</dd>
                    </div>
                  </dl>
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="gap-1.5" onClick={() => onOpenUrl(row)}>
                {row.source === "drive" ? <Link2 className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                {t("companyHybridDocOpen")}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </Button>
              {canMutate ? (
                <>
                  <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => onEdit(row)}>
                    <Pencil className="h-4 w-4" />
                    {t("companyHybridDocEdit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => onDelete(row)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("companyHybridDocDelete")}
                  </Button>
                </>
              ) : null}
            </div>

            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">{t("companyHybridDocAuditTitle")}</p>
              {eventsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : events.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("companyHybridDocAuditEmpty")}</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {events.map((ev) => (
                    <li key={ev.id} className="rounded-md border px-2 py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-medium">{auditActionLabel(ev.action, t)}</span>
                        <span className="text-muted-foreground">{formatHybridDocumentCreatedAt(ev.created_at)}</span>
                      </div>
                      <p className="text-muted-foreground">
                        {[ev.actor_name, ev.actor_store].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
