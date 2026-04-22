"use client"

import { CalendarIcon } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

interface InboundFilterBarProps {
  totalAmount: string
  isOffice?: boolean
  /** 본사일 때 매장 필터 (전체/입고등록/매장명) */
  histStore?: string
  stores?: string[]
  onHistStoreChange?: (v: string) => void
  histStart: string
  histEnd: string
  histMonth: string
  onHistStartChange: (v: string) => void
  onHistEndChange: (v: string) => void
  onHistMonthChange: (v: string) => void
  onMonthClick?: () => void
  histVendor: string
  vendors: string[]
  onHistVendorChange: (v: string) => void
  /** 품목 코드·명 부분 검색 (입고된 모든 품목 대상) */
  histItemSearch?: string
  onHistItemSearchChange?: (v: string) => void
  /** 드롭다운 미선택 시 거래처명 부분 검색 */
  histVendorSearch?: string
  onHistVendorSearchChange?: (v: string) => void
  /** 본사/매장 구분 필터 */
  histPurchaseSource?: "" | "hq" | "store"
  onHistPurchaseSourceChange?: (v: "" | "hq" | "store") => void
  onSearch: () => void
}

export function InboundFilterBar({
  totalAmount,
  isOffice = true,
  histStore = "",
  stores = [],
  onHistStoreChange,
  histStart,
  histEnd,
  histMonth,
  onHistStartChange,
  onHistEndChange,
  onHistMonthChange,
  onMonthClick,
  histVendor,
  vendors,
  onHistVendorChange,
  histItemSearch = "",
  onHistItemSearchChange,
  histVendorSearch = "",
  onHistVendorSearchChange,
  histPurchaseSource = "",
  onHistPurchaseSourceChange,
  onSearch,
}: InboundFilterBarProps) {
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

        {isOffice && stores.length > 0 && onHistStoreChange && (
          <select
            value={histStore || "__all__"}
            onChange={(e) => onHistStoreChange(e.target.value === "__all__" ? "" : e.target.value)}
            className="h-8 rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
          >
            <option value="__all__">{t("store_all_stores")}</option>
            <option value="입고등록">{t("inLocationHQ")}</option>
            {stores.filter((s) => s && s !== "All").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {onHistPurchaseSourceChange && (
          <select
            value={histPurchaseSource || "__all__"}
            onChange={(e) => onHistPurchaseSourceChange(e.target.value === "__all__" ? "" : (e.target.value as "hq" | "store"))}
            className="h-8 rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
          >
            <option value="__all__">{t("stockFilterStoreAll") || "전체"}</option>
            <option value="hq">{t("itemsPurchaseSourceHq") || "본사"}</option>
            <option value="store">{t("itemsPurchaseSourceStore") || "매장"}</option>
          </select>
        )}
        <select
          value={histVendor || "__all__"}
          onChange={(e) => {
            onHistVendorChange(e.target.value === "__all__" ? "" : e.target.value)
            onHistVendorSearchChange?.("")
          }}
          className="h-8 min-w-[120px] rounded border border-input bg-card px-2 pr-6 text-xs text-card-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
        >
          <option value="__all__">{t("inVendorAll")}</option>
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {onHistVendorSearchChange && (
          <input
            type="text"
            value={histVendorSearch}
            onChange={(e) => onHistVendorSearchChange(e.target.value)}
            disabled={!!histVendor}
            title={histVendor ? t("inVendorAll") : t("inVendorSearchHint") || "거래처명 일부로 검색"}
            placeholder={t("inVendorSearchPh") || "거래처 검색(부분)"}
            className="h-8 w-[140px] rounded border border-input bg-card px-2 text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        )}
        {onHistItemSearchChange && (
          <input
            type="text"
            value={histItemSearch}
            onChange={(e) => onHistItemSearchChange(e.target.value)}
            placeholder={t("inItemSearchPh") || "품목 코드·명 검색"}
            className="h-8 w-[160px] rounded border border-input bg-card px-2 text-xs text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}

        {/* Search Button */}
        <button
          type="button"
          onClick={onSearch}
          className="h-8 rounded bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-colors shadow-sm"
        >
          {t("stockBtnSearch")}
        </button>

        {/* Total */}
        <div className="ml-auto">
          <span className="text-sm font-bold text-[#16A34A]">
            {t("inPeriodTotal")}: {totalAmount}
          </span>
        </div>
      </div>
    </div>
  )
}
