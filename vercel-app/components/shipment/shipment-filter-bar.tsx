"use client"

import * as React from "react"
import { Search, Printer, Download, FileX, CalendarIcon, Store, Trash2 } from "lucide-react"
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
  histTargetType: "" | "store" | "sales"
  histStore: string
  outboundTargets: string[]
  storeTargets: string[]
  salesTargets: string[]
  onHistTargetTypeChange: (v: "" | "store" | "sales") => void
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
  onEtaxXmlDownload?: () => void
  /** 본사: 체크한 출고 그룹 일괄 소프트 삭제 */
  onDeleteSelected?: () => void
  /** 삭제 처리 중 (버튼 비활성화) */
  deleteBusy?: boolean
  /** 선택된 행 수 (0이면 인쇄/엑셀/e-Tax/삭제 버튼 비활성화) */
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
  histTargetType = "",
  histStore,
  outboundTargets,
  storeTargets = [],
  salesTargets = [],
  onHistTargetTypeChange,
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
  onEtaxXmlDownload,
  onDeleteSelected,
  deleteBusy = false,
  selectedCount = 0,
}: ShipmentFilterBarProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [storeSearchQuery, setStoreSearchQuery] = React.useState("")
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = React.useState(false)
  const storeInputRef = React.useRef<HTMLInputElement>(null)
  const storeDropdownRef = React.useRef<HTMLDivElement>(null)

  const targetOptions = React.useMemo(() => {
    if (histTargetType === "store") return storeTargets
    if (histTargetType === "sales") return salesTargets
    return outboundTargets
  }, [histTargetType, storeTargets, salesTargets, outboundTargets])

  const filteredStores = React.useMemo(() => {
    const q = storeSearchQuery.trim().toLowerCase()
    if (!q) return targetOptions
    return targetOptions.filter((s) => s.toLowerCase().includes(q))
  }, [targetOptions, storeSearchQuery])

  const displayStoreValue = histStore || ""

  React.useEffect(() => {
    if (!isStoreDropdownOpen) setStoreSearchQuery("")
  }, [isStoreDropdownOpen])

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        storeDropdownRef.current &&
        !storeDropdownRef.current.contains(e.target as Node) &&
        storeInputRef.current &&
        !storeInputRef.current.contains(e.target as Node)
      ) {
        setIsStoreDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleStoreSelect = (store: string) => {
    onHistStoreChange(store)
    setIsStoreDropdownOpen(false)
    setStoreSearchQuery("")
  }

  const handleStoreClear = () => {
    onHistStoreChange("")
    setStoreSearchQuery("")
    storeInputRef.current?.focus()
  }

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

            {/* 수령처 유형: 전체 / 매장 / 판매처 */}
            <select
              value={histTargetType || "__all__"}
              onChange={(e) => onHistTargetTypeChange((e.target.value === "__all__" ? "" : e.target.value) as "" | "store" | "sales")}
              className="h-8 w-[110px] rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="__all__">{t("outFilterTargetType")}: {t("outTypeAll")}</option>
              <option value="store">{t("outTargetTypeStore")}</option>
              <option value="sales">{t("outTargetTypeSales")}</option>
            </select>

            {/* 매장 검색 (출고처 선택) - 검색 가능한 드롭다운 */}
            <div className="relative" ref={storeDropdownRef}>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <input
                    ref={storeInputRef}
                    type="text"
                    value={isStoreDropdownOpen ? storeSearchQuery : displayStoreValue}
                    onChange={(e) => {
                      setStoreSearchQuery(e.target.value)
                      setIsStoreDropdownOpen(true)
                    }}
                    onFocus={() => setIsStoreDropdownOpen(true)}
                    placeholder={t("outStoreSearchPh") || `${t("outFilterStore")} 검색`}
                    className="h-8 w-[160px] rounded border border-input bg-card px-2 pr-8 text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Store className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <button
                  type="button"
                  onClick={() => (histStore ? handleStoreClear() : setIsStoreDropdownOpen(!isStoreDropdownOpen))}
                  className="h-8 px-2 rounded border border-input bg-card text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title={histStore ? t("outFilterStoreAll") : (isStoreDropdownOpen ? "닫기" : "열기")}
                >
                  {histStore ? "×" : (isStoreDropdownOpen ? "▲" : "▼")}
                </button>
              </div>
              {isStoreDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 z-50 w-[220px] max-h-[200px] overflow-y-auto rounded border border-border bg-card shadow-lg py-1">
                  <button
                    type="button"
                    onClick={() => handleStoreSelect("")}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    {t("outFilterStoreAll")}
                  </button>
                  {filteredStores.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">{t("outNoStoreMatch") || "검색 결과 없음"}</div>
                  ) : (
                    filteredStores.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleStoreSelect(s)}
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-accent focus:bg-accent focus:outline-none ${histStore === s ? "bg-accent/50 font-medium" : ""}`}
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

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

        {onPrintInvoice && (
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

        {isOffice && onDeleteSelected && (
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0 || deleteBusy}
            className="h-8 flex items-center gap-1.5 rounded border border-destructive/50 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("delete")}
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

        {isOffice && onEtaxXmlDownload && (
          <button
            type="button"
            onClick={onEtaxXmlDownload}
            disabled={selectedCount === 0}
            className="h-8 flex items-center gap-1.5 rounded bg-[#0ea5e9] px-3 text-xs font-medium text-white hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("outEtaxXmlHint")}
          >
            <FileX className="h-3.5 w-3.5" />
            {t("outEtaxXml")}
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
      <p className="mt-2 text-[11px] text-muted-foreground">
        {histMonth
          ? "월 필터 적용 중: 선택한 월 전체 기간으로 조회됩니다."
          : "기간을 직접 입력하면 월 필터는 해제되고 입력한 기간으로 조회됩니다."}
      </p>
    </div>
  )
}
