"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  PosDeliveryAppReconcileResult,
  PosKbankQrReconcileResult,
} from "@/lib/api-client"
import { SalesDeliveryAppReconcilePanel } from "@/components/tabs/sales-delivery-app-reconcile-panel"
import { SalesKbankQrReconcilePanel } from "@/components/tabs/sales-kbank-qr-reconcile-panel"

export type ChannelReconcileSection = "delivery" | "kbank-qr"

export function SalesChannelReconcilePanel(props: {
  section: ChannelReconcileSection
  onSectionChange: (section: ChannelReconcileSection) => void
  deliveryData: PosDeliveryAppReconcileResult
  kbankQrData: PosKbankQrReconcileResult
  placeholder?: string | null
  tr: (key: string, fallback: string) => string
  formatAmount: (n: number) => string
  storeDisplayName: (code: string) => string
}) {
  const {
    section,
    onSectionChange,
    deliveryData,
    kbankQrData,
    placeholder,
    tr,
    formatAmount,
    storeDisplayName,
  } = props

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={tr("salesChannelReconcileSectionsAria", "채널 확인 구분")}
      >
        <Button
          type="button"
          size="sm"
          variant={section === "delivery" ? "default" : "outline"}
          className={cn(section === "delivery" && "pointer-events-none")}
          role="tab"
          aria-selected={section === "delivery"}
          onClick={() => onSectionChange("delivery")}
        >
          {tr("salesChannelReconcileDelivery", "배달앱")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={section === "kbank-qr" ? "default" : "outline"}
          className={cn(section === "kbank-qr" && "pointer-events-none")}
          role="tab"
          aria-selected={section === "kbank-qr"}
          onClick={() => onSectionChange("kbank-qr")}
        >
          {tr("salesChannelReconcileKbankQr", "KBank QR")}
        </Button>
      </div>

      {section === "delivery" ? (
        <SalesDeliveryAppReconcilePanel
          data={deliveryData}
          placeholder={placeholder ?? null}
          tr={tr}
          formatAmount={formatAmount}
          storeDisplayName={storeDisplayName}
        />
      ) : (
        <SalesKbankQrReconcilePanel
          data={kbankQrData}
          placeholder={placeholder ?? null}
          tr={tr}
          formatAmount={formatAmount}
          storeDisplayName={storeDisplayName}
        />
      )}
    </div>
  )
}
