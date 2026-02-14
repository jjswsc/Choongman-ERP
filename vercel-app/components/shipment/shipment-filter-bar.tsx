"use client"

import { Search, Printer, Download, CalendarIcon } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

interface ShipmentFilterBarProps {
  totalAmount: string
  /** 본사 권한 시 확장 필터 표시 */
  isOffice?: boolean
  // Period
  histStart: string
  histEnd: string
  histMonth: string
  onHistStartChange: (v: string) => void
  onHistEndChange: (v: string) => void
  onHistMonthChange: (v: string) => void
  onMonthClick?: () => void
  // Type & Store (histType: "" | "Order" | "Force" - Order=주문승인, Force=강제출고)
  histType: string
  histDeliveryStatus: string
  histStore: string
  outboundTargets: string[]
  onHistTypeChange: (v: string) => void
  onHistDeliveryStatusChange: (v: string) => void
  onHistStoreChange: (v: string) => void
  // Invoice search (client-side filter)
  invoiceSearch?: string
  onInvoiceSearchChange?: (v: string) => void
  // Item search (client-side filter)
  itemSearch?: string
  onItemSearchChange?: (v: string) => void
  // Actions
  onSearch: () => void
  onPrintInvoice?: () => void
  onExcelDownload?: () => void
  /** 선택된 행 수 (0이면 인쇄/엑셀 버튼 비활성화) */
  selectedCount?: number
}

export function ShipmentFilterBar({
  totalAmount,
  isOffice = true,
  histStart,
  histEnd,
  histMonth,
  onHistStartChange,
  onHistEndChange,
  onHistMonthChange,
  onMonthClick,
  histType,
  histDeliveryStatus = "",
  histStore,
  outboundTargets,
  onHistTypeChange,
  onHistDeliveryStatusChange,
  onHistStoreChange,
  invoiceSearch = "",
  onInvoiceSearchChange,
  itemSearch = "",
  onItemSearchChange,
  onSearch,
  onPrintInvoice,
  onExcelDownload,
  selectedCount = 0,
}: ShipmentFilterBarProps) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Period */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {t("outFilterPeriod")}
          </label>
          <input
            type="date"
            value={histStart}
            onChange={(e) => onHistStartChange(e.target.value)}
            className="h-8 w-[110px] rounded border border-input bg-card px-2 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="date"
            value={histEnd}
            onChange={(e) => onHistEndChange(e.target.value)}
            className="h-8 w-[110px] rounded border border-input bg-card px-2 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Monthly */}
        <button
          type="button"
          onClick={onMonthClick}
          className="h-8 rounded border border-input bg-card px-3 text-xs font-medium text-card-foreground hover:bg-accent transition-colors"
        >
          {t("outFilterMonth")}
        </button>

        {/* Year-Month */}
        <div className="relative">
          <input
            type="month"
            value={histMonth}
            onChange={(e) => onHistMonthChange(e.target.value)}
            title={t("inMonthHint")}
            className="h-8 w-[100px] rounded border border-input bg-card px-2 pr-7 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <CalendarIcon className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        {isOffice && (
          <>
            {/* 주문유형 (Order Type): 주문승인 / 강제출고 - placeholder로 라벨 포함 */}
            <select
              value={histType || "__all__"}
              onChange={(e) => onHistTypeChange(e.target.value === "__all__" ? "" : e.target.value)}
              className="h-8 w-[110px] rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="__all__">{t("outFilterOrderType")}: {t("outTypeAll")}</option>
              <option value="Order">{t("outTypeOrder")}</option>
              <option value="Force">{t("outTypeForce")}</option>
            </select>

            {/* 출고 유형 (배송상태): 배송완료 / 일부배송완료 / 배송중 - placeholder로 라벨 포함 */}
            <select
              value={histDeliveryStatus || "__all__"}
              onChange={(e) => onHistDeliveryStatusChange(e.target.value === "__all__" ? "" : e.target.value)}
              className="h-8 w-[130px] rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="__all__">{t("outFilterOutboundType")}: {t("outTypeAll")}</option>
              <option value="배송완료">{t("outDeliveryDelivered")}</option>
              <option value="일부배송완료">{t("outDeliveryPartial")}</option>
              <option value="배송중">{t("outDeliveryTransit")}</option>
            </select>

            {/* 출고처 - placeholder로 라벨 포함 */}
            <select
              value={histStore || "__all__"}
              onChange={(e) => onHistStoreChange(e.target.value === "__all__" ? "" : e.target.value)}
              className="h-8 min-w-[120px] rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="__all__">{t("outFilterStore")}: {t("outFilterStoreAll")}</option>
              {outboundTargets.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Invoice Search */}
            <div className="relative">
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => onInvoiceSearchChange?.(e.target.value)}
                placeholder={t("outInvoiceSearchPh")}
                className="h-8 w-[140px] rounded border border-input bg-card px-2 pr-7 text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            {/* Item Search */}
            <div className="relative">
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => onItemSearchChange?.(e.target.value)}
                placeholder={t("outItemSearchPh")}
                className="h-8 w-[120px] rounded border border-input bg-card px-2 pr-7 text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </>
        )}

        {/* Search Button */}
        <button
          type="button"
          onClick={onSearch}
          className="h-8 rounded bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-colors shadow-sm"
        >
          {t("stockBtnSearch")}
        </button>

        {isOffice && onPrintInvoice && (
          <button
            type="button"
            onClick={onPrintInvoice}
            disabled={selectedCount === 0}
            className="h-8 flex items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="h-3.5 w-3.5" />
            {t("outPrintInvoice")}
            {selectedCount > 0 && ` (${selectedCount})`}
          </button>
        )}

        {isOffice && onExcelDownload && (
          <button
            type="button"
            onClick={onExcelDownload}
            disabled={selectedCount === 0}
            className="h-8 flex items-center gap-1.5 rounded bg-[#16A34A] px-3 text-xs font-medium text-white hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-3.5 w-3.5" />
            {t("outExcelDownload")}
            {selectedCount > 0 && ` (${selectedCount})`}
          </button>
        )}

        {/* Total */}
        <div className="ml-auto">
          <span className="text-sm font-bold text-[#16A34A]">
            {t("outPeriodTotal")}: {totalAmount}
          </span>
        </div>
      </div>
    </div>
  )
}
