"use client"

import {
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ExternalLink,
  FileUp,
  Link2,
  Mail,
  Pencil,
  Trash2,
} from "lucide-react"
import type { CompanyHybridDocumentListItem } from "@/lib/api-client"
import { formatCompanyHybridDocDateForInput } from "@/lib/company-hybrid-documents"
import { documentHasCorrespondence, getCorrespondenceFromMetadata } from "@/lib/company-hybrid-correspondence"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CompanyHybridDocumentExpiryBadge } from "@/components/erp/company-hybrid-documents/document-expiry-badge"
import { formatFileSize, formatHybridDocumentCreatedAt } from "@/components/erp/company-hybrid-documents/shared"
import { cn } from "@/lib/utils"

type Props = {
  list: CompanyHybridDocumentListItem[]
  showStoreColumn: boolean
  titleSort: "asc" | "desc" | null
  onTitleSort: () => void
  t: (key: string) => string
  formatStoreLabel: (store: string) => string
  labelCategory: (row: CompanyHybridDocumentListItem) => string
  labelVisibility: (row: CompanyHybridDocumentListItem) => string
  labelCorrDirection: (d: string | undefined) => string
  labelCorrStatus: (s: string | undefined) => string
  formatCorrHint: (corr: ReturnType<typeof getCorrespondenceFromMetadata>) => string
  canMutateDocStore: (store: string) => boolean
  onRowClick: (row: CompanyHybridDocumentListItem) => void
  onOpen: (row: CompanyHybridDocumentListItem) => void
  onEdit: (row: CompanyHybridDocumentListItem) => void
  onDelete: (row: CompanyHybridDocumentListItem) => void
}

export function CompanyHybridDocumentListTable({
  list,
  showStoreColumn,
  titleSort,
  onTitleSort,
  t,
  formatStoreLabel,
  labelCategory,
  labelVisibility,
  labelCorrDirection,
  labelCorrStatus,
  formatCorrHint,
  canMutateDocStore,
  onRowClick,
  onOpen,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showStoreColumn ? (
              <TableHead className="whitespace-nowrap">{t("companyHybridDocColStore")}</TableHead>
            ) : null}
            <TableHead
              className="min-w-[10rem]"
              aria-sort={titleSort === "asc" ? "ascending" : titleSort === "desc" ? "descending" : undefined}
            >
              <button
                type="button"
                className={cn(
                  "-mx-1 -my-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 font-medium",
                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
                onClick={onTitleSort}
                title={t("companyHybridDocTitleSortHint")}
              >
                <span className="truncate">{t("companyHybridDocColTitle")}</span>
                {titleSort === "asc" ? (
                  <ArrowUpNarrowWide className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                ) : titleSort === "desc" ? (
                  <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70" aria-hidden />
                )}
              </button>
            </TableHead>
            <TableHead className="hidden min-w-[5rem] max-w-[9rem] lg:table-cell">
              {t("companyHybridDocColCategory")}
            </TableHead>
            <TableHead className="hidden whitespace-nowrap md:table-cell">{t("companyHybridDocColValidity")}</TableHead>
            <TableHead className="hidden whitespace-nowrap xl:table-cell">{t("companyHybridDocColCreated")}</TableHead>
            <TableHead className="hidden whitespace-nowrap lg:table-cell">{t("companyHybridDocColCreatedBy")}</TableHead>
            <TableHead className="w-12 text-center">{t("companyHybridDocColType")}</TableHead>
            <TableHead className="w-[8.5rem] text-right">{t("stockColAction")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((row) => {
            const canM = canMutateDocStore(row.store)
            const hasCorr = documentHasCorrespondence(row.metadata)
            const corr = hasCorr ? getCorrespondenceFromMetadata(row.metadata) : null
            return (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => onRowClick(row)}
              >
                {showStoreColumn ? (
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatStoreLabel(row.store)}
                  </TableCell>
                ) : null}
                <TableCell>
                  <div className="font-medium leading-snug">{row.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <CompanyHybridDocumentExpiryBadge
                      validTo={row.valid_to}
                      labels={{
                        expiringSoon: t("companyHybridDocExpiryBadgeExpiringSoon"),
                        expired: t("companyHybridDocExpiryBadgeExpired"),
                      }}
                    />
                    {labelVisibility(row) !== t("companyHybridDocPermissionAll") ? (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                        {labelVisibility(row)}
                      </Badge>
                    ) : null}
                    {hasCorr && corr ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground" title={formatCorrHint(corr)}>
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="max-w-[14rem] truncate text-[11px]">{formatCorrHint(corr)}</span>
                      </span>
                    ) : null}
                  </div>
                  {row.file_name ? (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {row.file_name} · {formatFileSize(row.file_size)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="hidden max-w-[9rem] truncate text-sm text-muted-foreground lg:table-cell">
                  {labelCategory(row)}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                  {!row.valid_from && !row.valid_to ? (
                    "—"
                  ) : (
                    <>
                      <div>{formatCompanyHybridDocDateForInput(row.valid_from) || "—"}</div>
                      {row.valid_to ? (
                        <div className="text-[11px] text-muted-foreground/80">
                          ~ {formatCompanyHybridDocDateForInput(row.valid_to)}
                        </div>
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground xl:table-cell">
                  {formatHybridDocumentCreatedAt(row.created_at)}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
                  {row.created_by_name || "—"}
                </TableCell>
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md",
                      row.source === "drive"
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                        : "bg-sky-500/15 text-sky-800 dark:text-sky-200"
                    )}
                    title={
                      row.source === "drive"
                        ? t("companyHybridDocSourceDrive")
                        : t("companyHybridDocSourceStorage")
                    }
                  >
                    {row.source === "drive" ? (
                      <Link2 className="h-4 w-4" aria-hidden />
                    ) : (
                      <FileUp className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex flex-wrap justify-end gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => onOpen(row)}
                      title={t("companyHybridDocOpen")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    {canM ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => onEdit(row)}
                        title={t("companyHybridDocEdit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {canM ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(row)}
                        title={t("companyHybridDocDelete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
