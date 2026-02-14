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
  // Type & Store
  histType: string
  histStore: string
  outboundTargets: string[]
  onHistTypeChange: (v: string) => void
  onHistStoreChange: (v: string) => void
  // Invoice search (client-side filter)
  invoiceSearch?: string
  onInvoiceSearchChange?: (v: string) => void
  // Actions
  onSearch: () => void
  onPrintInvoice?: () => void
  onExcelDownload?: () => void
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
  histStore,
  outboundTargets,
  onHistTypeChange,
  onHistStoreChange,
  invoiceSearch = "",
  onInvoiceSearchChange,
  onSearch,
  onPrintInvoice,
  onExcelDownload,
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
            {/* Type Filter */}
            <select
              value={histType || "__all__"}
              onChange={(e) => onHistTypeChange(e.target.value === "__all__" ? "" : e.target.value)}
              className="h-8 rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="__all__">{t("outTypeAll")}</option>
              <option value="Force">{t("outTypeForce")}</option>
              <option value="Order">{t("outTypeOrder")}</option>
            </select>

            {/* Destination Filter */}
            <select
              value={histStore || "__all__"}
              onChange={(e) => onHistStoreChange(e.target.value === "__all__" ? "" : e.target.value)}
              className="h-8 rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="__all__">{t("outFilterStoreAll")}</option>
              {outboundTargets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
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
            className="h-8 flex items-center gap-1.5 rounded border border-primary bg-card px-3 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            {t("outPrintInvoice")}
          </button>
        )}

        {isOffice && onExcelDownload && (
          <button
            type="button"
            onClick={onExcelDownload}
            className="h-8 flex items-center gap-1.5 rounded border border-success bg-success px-3 text-xs font-medium text-success-foreground hover:opacity-90 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            {t("outExcelDownload")}
          </button>
        )}

        {/* Total */}
        <div className="ml-auto">
          <span className="text-sm font-bold text-destructive">
            {t("outPeriodTotal")}: {totalAmount}
          </span>
        </div>
      </div>
    </div>
  )
}
