"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  decodeFinancialStatementStoreFilter,
  encodeFinancialStatementStoreFilter,
  isFinancialStatementStoreNone,
  normalizeFinancialStatementStoreCodes,
  type FinancialStatementStoreOption,
} from "@/lib/financial-statement-store-options"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { labelForStore } from "@/lib/store-list-keys"
import { cn } from "@/lib/utils"

type FinancialStatementStorePickerProps = {
  value: string
  onChange: (storeFilter: string) => void
  franchiseStoreOptions: FinancialStatementStoreOption[]
  showOfficeOption?: boolean
  allLabel: string
  disabled?: boolean
  className?: string
}

export function FinancialStatementStorePicker({
  value,
  onChange,
  franchiseStoreOptions,
  showOfficeOption = false,
  allLabel,
  disabled = false,
  className,
}: FinancialStatementStorePickerProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const franchiseCodes = React.useMemo(
    () => franchiseStoreOptions.map((o) => o.value),
    [franchiseStoreOptions]
  )
  const decoded = React.useMemo(
    () => decodeFinancialStatementStoreFilter(value, franchiseCodes),
    [value, franchiseCodes]
  )
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [storeSearch, setStoreSearch] = React.useState("")
  const pickerRef = React.useRef<HTMLDivElement | null>(null)
  const pickerListId = React.useId()
  const pickerBtnId = React.useId()

  const filteredOptions = React.useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return franchiseStoreOptions
    return franchiseStoreOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    )
  }, [franchiseStoreOptions, storeSearch])

  const applySelection = React.useCallback(
    (next: { selectedFranchiseStores: string[]; officeSelected: boolean }) => {
      onChange(
        encodeFinancialStatementStoreFilter({
          franchiseStoreCodes: franchiseCodes,
          selectedFranchiseStores: next.selectedFranchiseStores,
          officeSelected: next.officeSelected,
          allFranchiseSelected:
            franchiseCodes.length > 0 &&
            next.selectedFranchiseStores.length === franchiseCodes.length &&
            !next.officeSelected,
        })
      )
    },
    [franchiseCodes, onChange]
  )

  const summaryLabel = React.useMemo(() => {
    if (decoded.officeSelected) return t("pettyScopeOffice") || "본사"
    if (isFinancialStatementStoreNone(value) || decoded.selectedFranchiseStores.length === 0) {
      return t("salesStoreDeselectAll") || "선택 없음"
    }
    if (value === "All" || decoded.selectedFranchiseStores.length === franchiseCodes.length) {
      return allLabel
    }
    if (decoded.selectedFranchiseStores.length === 1) {
      const code = decoded.selectedFranchiseStores[0]!
      return franchiseStoreOptions.find((o) => o.value === code)?.label || code
    }
    return `${decoded.selectedFranchiseStores.length}${t("selected") || "개 선택"}`
  }, [allLabel, decoded, franchiseCodes.length, franchiseStoreOptions, t, value])

  React.useEffect(() => {
    if (!pickerOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [pickerOpen])

  return (
    <div className={cn("relative", className)} ref={pickerRef}>
      <Button
        id={pickerBtnId}
        type="button"
        size="sm"
        variant="outline"
        className="h-9 w-full min-w-0 justify-between sm:min-w-[200px] sm:w-auto"
        disabled={disabled}
        aria-expanded={pickerOpen}
        aria-controls={pickerListId}
        aria-haspopup="dialog"
        onClick={() => setPickerOpen((prev) => !prev)}
      >
        <span className="truncate text-left">{summaryLabel}</span>
        <span className="ml-2 text-xs text-muted-foreground">{pickerOpen ? "▲" : "▼"}</span>
      </Button>
      {pickerOpen ? (
        <div
          id={pickerListId}
          role="dialog"
          aria-labelledby={pickerBtnId}
          className="absolute z-30 mt-1 w-[min(320px,calc(100vw-2rem))] max-w-[calc(100vw-1.5rem)] rounded-md border bg-background p-2 shadow-lg left-0 right-auto sm:right-auto"
        >
          <Input
            value={storeSearch}
            onChange={(e) => setStoreSearch(e.target.value)}
            placeholder={t("salesStoreSearch") || "매장 검색"}
            className="mb-2 h-8"
          />
          <div className="mb-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_XS_CN}
              onClick={() =>
                applySelection({ selectedFranchiseStores: [...franchiseCodes], officeSelected: false })
              }
            >
              {allLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_XS_CN}
              onClick={() =>
                applySelection({ selectedFranchiseStores: [...franchiseCodes], officeSelected: false })
              }
            >
              {t("salesStoreSelectAll") || "전체 선택"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_XS_CN}
              onClick={() => applySelection({ selectedFranchiseStores: [], officeSelected: false })}
            >
              {t("salesStoreDeselectAll") || "전체 해제"}
            </Button>
            {showOfficeOption ? (
              <Button
                type="button"
                size="sm"
                variant={decoded.officeSelected ? "default" : "outline"}
                className={ADMIN_BTN_XS_CN}
                onClick={() => applySelection({ selectedFranchiseStores: [], officeSelected: true })}
              >
                {t("pettyScopeOffice") || "본사"}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_XS_CN}
              onClick={() => setPickerOpen(false)}
            >
              {t("close") || "닫기"}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded border p-1">
            {filteredOptions.map((o) => {
              const checked = !decoded.officeSelected && decoded.selectedFranchiseStores.includes(o.value)
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    disabled={decoded.officeSelected}
                    onCheckedChange={() => {
                      const exists = decoded.selectedFranchiseStores.includes(o.value)
                      const nextStores = exists
                        ? decoded.selectedFranchiseStores.filter((v) => v !== o.value)
                        : [...decoded.selectedFranchiseStores, o.value]
                      applySelection({
                        selectedFranchiseStores: normalizeFinancialStatementStoreCodes(nextStores),
                        officeSelected: false,
                      })
                    }}
                  />
                  <span className="min-w-0 truncate text-sm">{o.label}</span>
                </label>
              )
            })}
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("locationNoResult") || "결과 없음"}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function resolveFinancialStatementPickerLabel(
  storeFilter: string,
  storeLabels: Record<string, string>,
  t: (key: string) => string,
  opts?: { franchiseAggregateAll?: boolean }
): string {
  if (isFinancialStatementStoreNone(storeFilter)) {
    return t("salesStoreDeselectAll") || "선택 없음"
  }
  if (storeFilter === "All") {
    return opts?.franchiseAggregateAll
      ? t("store_all_my_franchise_stores") || t("salesSelectMyFranchiseStoresAll") || "내 매장 전체"
      : t("all") || "전체"
  }
  if (storeFilter === "본사") return t("pettyScopeOffice") || "본사"
  if (storeFilter.includes(",")) {
    return storeFilter
      .split(",")
      .map((s) => labelForStore(storeLabels, s.trim()) || s.trim())
      .filter(Boolean)
      .join(", ")
  }
  return labelForStore(storeLabels, storeFilter) || storeFilter
}
