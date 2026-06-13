"use client"

import { Badge } from "@/components/ui/badge"
import {
  getCompanyHybridDocExpiryStatus,
  type CompanyHybridDocExpiryStatus,
} from "@/lib/company-hybrid-documents-expiry"
import { cn } from "@/lib/utils"

type Props = {
  validTo: string | null | undefined
  labels: { expiringSoon: string; expired: string }
  className?: string
}

export function CompanyHybridDocumentExpiryBadge({ validTo, labels, className }: Props) {
  const status: CompanyHybridDocExpiryStatus = getCompanyHybridDocExpiryStatus(validTo)
  if (status !== "expiring_soon" && status !== "expired") return null
  const isExpired = status === "expired"
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 px-1.5 text-[10px] font-normal",
        isExpired
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        className
      )}
    >
      {isExpired ? labels.expired : labels.expiringSoon}
    </Badge>
  )
}
