"use client"

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { StoreVendorLinkEvaluation } from "@/lib/store-vendor-tax-link"

type Translate = (key: string) => string
type TranslateParams = (
  t: Translate,
  key: string,
  params: Record<string, string>
) => string

export type StoreVendorTaxLinkBannerProps = {
  t: Translate
  tr: TranslateParams
  loading: boolean
  storeFilter: string
  isOffice: boolean
  storeLinkEval: StoreVendorLinkEvaluation | null
  vendorLinkCounts: { missing: number; inferred: number; total: number }
  onOpenStoreProfiles?: () => void
  showProfileShortcut?: boolean
  extra?: React.ReactNode
}

export function StoreVendorTaxLinkStatusBlock({
  t,
  tr,
  loading,
  storeFilter,
  isOffice,
  storeLinkEval,
  vendorLinkCounts,
}: Omit<StoreVendorTaxLinkBannerProps, "onOpenStoreProfiles" | "showProfileShortcut" | "extra">) {
  if (loading) {
    return <p className="text-xs text-muted-foreground">{t("accCompPp30VendorLinkChecking")}</p>
  }

  if (storeFilter !== "All" && storeLinkEval) {
    return (
      <div
        className={cn(
          "rounded-md border px-3 py-2 text-xs leading-relaxed",
          storeLinkEval.status === "linked" &&
            "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
          storeLinkEval.status === "inferred" &&
            "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
          storeLinkEval.status === "profile_only" &&
            "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100",
          storeLinkEval.status === "missing" && "border-destructive/40 bg-destructive/10 text-destructive"
        )}
      >
        {storeLinkEval.status === "linked"
          ? tr(t, "accCompPp30VendorLinkOk", {
              vendor: storeLinkEval.vendorCode,
              name: storeLinkEval.vendorName,
            })
          : storeLinkEval.status === "inferred"
            ? tr(t, "accCompPp30VendorLinkInferred", {
                vendor: storeLinkEval.vendorCode,
                name: storeLinkEval.vendorName,
              })
            : storeLinkEval.status === "profile_only"
              ? t("accCompPp30VendorLinkProfileOnly")
              : t("accCompPp30VendorLinkMissing")}
      </div>
    )
  }

  if (storeFilter === "All" && isOffice && vendorLinkCounts.total > 0) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
        {tr(t, "accCompPp30VendorLinkSummary", {
          missing: String(vendorLinkCounts.missing),
          inferred: String(vendorLinkCounts.inferred),
          total: String(vendorLinkCounts.total),
        })}
      </div>
    )
  }

  return null
}

export function StoreVendorTaxLinkBanner({
  t,
  tr,
  loading,
  storeFilter,
  isOffice,
  storeLinkEval,
  vendorLinkCounts,
  onOpenStoreProfiles,
  showProfileShortcut = false,
  extra,
}: StoreVendorTaxLinkBannerProps) {
  return (
    <div className="space-y-2">
      {showProfileShortcut ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{t("accCompPp30StoreProfileBanner")}</p>
          {onOpenStoreProfiles ? (
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onOpenStoreProfiles}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              {t("accCompPp30OpenStoreProfiles")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <StoreVendorTaxLinkStatusBlock
        t={t}
        tr={tr}
        loading={loading}
        storeFilter={storeFilter}
        isOffice={isOffice}
        storeLinkEval={storeLinkEval}
        vendorLinkCounts={vendorLinkCounts}
      />

      {extra}
    </div>
  )
}
