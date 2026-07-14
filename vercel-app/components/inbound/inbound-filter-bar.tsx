"use client"

import * as React from "react"
import { CalendarIcon, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ADMIN_NUMERIC_CN } from "@/lib/admin-ui-standards"
import { cn } from "@/lib/utils"

interface InboundFilterBarProps {
  totalAmount: string
  totalVat?: string
  isOffice?: boolean
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
  histItemSearch?: string
  onHistItemSearchChange?: (v: string) => void
  histVendorSearch?: string
  onHistVendorSearchChange?: (v: string) => void
  histPurchaseSource?: "" | "hq" | "store"
  onHistPurchaseSourceChange?: (v: "" | "hq" | "store") => void
  onSearch: () => void
}

export function InboundFilterBar({
  totalAmount,
  totalVat = "",
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
  const monthInputRef = React.useRef<HTMLInputElement | null>(null)

  const handleMonthButtonClick = React.useCallback(() => {
    onMonthClick?.()
    const monthInput = monthInputRef.current
    if (!monthInput) return
    if (typeof monthInput.showPicker === "function") {
      monthInput.showPicker()
      return
    }
    monthInput.click()
  }, [onMonthClick])

  return (
    <AdminFilterBar className="items-end">
      <AdminFilterField label={t("outFilterPeriod")}>
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={histStart}
            onChange={(e) => onHistStartChange(e.target.value)}
            className="h-9 w-[130px] text-xs"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={histEnd}
            onChange={(e) => onHistEndChange(e.target.value)}
            className="h-9 w-[130px] text-xs"
          />
        </div>
      </AdminFilterField>

      <AdminFilterField label={t("outFilterMonth")}>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant={histMonth ? "default" : "outline"}
            className="h-9 text-xs"
            onClick={handleMonthButtonClick}
          >
            {t("outFilterMonth")}
            {histMonth ? ` (${histMonth})` : ""}
          </Button>
          <div className="relative h-0 w-0 overflow-hidden">
            <Input
              ref={monthInputRef}
              type="month"
              value={histMonth}
              onChange={(e) => onHistMonthChange(e.target.value)}
              title={t("inMonthHint")}
              className="pointer-events-none absolute opacity-0"
              tabIndex={-1}
              aria-hidden
            />
          </div>
          {!!histMonth && (
            <span className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-muted/30 px-2 text-xs">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {histMonth}
            </span>
          )}
        </div>
      </AdminFilterField>

      {isOffice && stores.length > 0 && onHistStoreChange && (
        <AdminFilterField label={t("store")}>
          <Select
            value={histStore || "__all__"}
            onValueChange={(v) => onHistStoreChange(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("store_all_stores")}</SelectItem>
              {stores
                .filter((s) => s && s !== "All")
                .map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </AdminFilterField>
      )}

      {onHistPurchaseSourceChange && (
        <AdminFilterField label={t("itemsPurchaseSource")}>
          <Select
            value={histPurchaseSource || "__all__"}
            onValueChange={(v) =>
              onHistPurchaseSourceChange(v === "__all__" ? "" : (v as "hq" | "store"))
            }
          >
            <SelectTrigger className="h-9 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("stockFilterStoreAll")}</SelectItem>
              <SelectItem value="hq">{t("itemsPurchaseSourceHq")}</SelectItem>
              <SelectItem value="store">{t("itemsPurchaseSourceStore")}</SelectItem>
            </SelectContent>
          </Select>
        </AdminFilterField>
      )}

      <AdminFilterField label={t("inVendor")}>
        <Select
          value={histVendor || "__all__"}
          onValueChange={(v) => {
            onHistVendorChange(v === "__all__" ? "" : v)
            onHistVendorSearchChange?.("")
          }}
        >
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("inVendorAll")}</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AdminFilterField>

      {onHistVendorSearchChange && (
        <AdminFilterField label={t("inVendorSearchPh")}>
          <Input
            value={histVendorSearch}
            onChange={(e) => onHistVendorSearchChange(e.target.value)}
            disabled={!!histVendor}
            title={histVendor ? t("inVendorAll") : t("inVendorSearchHint")}
            placeholder={t("inVendorSearchPh")}
            className="h-9 w-[150px] text-xs"
          />
        </AdminFilterField>
      )}

      {onHistItemSearchChange && (
        <AdminFilterField label={t("inItem")}>
          <Input
            value={histItemSearch}
            onChange={(e) => onHistItemSearchChange(e.target.value)}
            placeholder={t("inItemSearchPh")}
            className="h-9 w-[160px] text-xs"
          />
        </AdminFilterField>
      )}

      <Button size="sm" className="h-9 gap-1.5 text-xs font-semibold" onClick={onSearch}>
        <Search className="h-3.5 w-3.5" aria-hidden />
        {t("stockBtnSearch")}
      </Button>

      <div className="ml-auto text-right">
        <p className={cn("text-sm font-bold text-emerald-600 dark:text-emerald-400", ADMIN_NUMERIC_CN)}>
          {t("inPeriodTotal")}: {totalAmount}
        </p>
        {totalVat ? (
          <p className={cn("text-xs font-semibold text-primary", ADMIN_NUMERIC_CN)}>
            {t("posVatLabel")}: {totalVat}
          </p>
        ) : null}
      </div>
    </AdminFilterBar>
  )
}
