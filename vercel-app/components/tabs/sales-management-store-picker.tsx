"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { normalizeStoreCodes } from "./sales-management-shared"

export type SalesStorePickerProps = {
  tr: (key: string, fallback: string) => string
  canSearchAll: boolean
  canFranchiseeMultiStore: boolean
  storePickerBtnId: string
  storePickerListId: string
  storePickerOpen: boolean
  setStorePickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  storePickerRef: React.RefObject<HTMLDivElement | null>
  storePickerPlaceholder: string
  selectedStores: string[]
  allStoreOptions: string[]
  onStoresChange: (stores: string[], meta?: { clearedAll?: boolean }) => void
  posBizDayStoreChoices: string[]
  posStoreDisplayName: (code: string) => string
  filteredStoreOptions: string[]
  storeSearch: string
  setStoreSearch: React.Dispatch<React.SetStateAction<string>>
  singleStoreLabel?: string
}

export function SalesStorePicker({
  tr,
  canSearchAll,
  canFranchiseeMultiStore,
  storePickerBtnId,
  storePickerListId,
  storePickerOpen,
  setStorePickerOpen,
  storePickerRef,
  storePickerPlaceholder,
  selectedStores,
  allStoreOptions,
  onStoresChange,
  posBizDayStoreChoices,
  posStoreDisplayName,
  filteredStoreOptions,
  storeSearch,
  setStoreSearch,
  singleStoreLabel,
}: SalesStorePickerProps) {
  const handleSelectAll = React.useCallback(() => {
    const q = storeSearch.trim()
    const targets = q ? filteredStoreOptions : allStoreOptions
    const merged = normalizeStoreCodes([...new Set([...selectedStores, ...targets])])
    onStoresChange(merged)
  }, [allStoreOptions, filteredStoreOptions, onStoresChange, selectedStores, storeSearch])

  const handleClearAll = React.useCallback(() => {
    const q = storeSearch.trim()
    if (q) {
      const remove = new Set(filteredStoreOptions)
      onStoresChange(normalizeStoreCodes(selectedStores.filter((s) => !remove.has(s))))
      return
    }
    onStoresChange([], { clearedAll: true })
  }, [filteredStoreOptions, onStoresChange, selectedStores, storeSearch])

  if (singleStoreLabel) {
    return (
      <Button type="button" size="sm" variant="default" disabled>
        {singleStoreLabel}
      </Button>
    )
  }

  return (
    <div className="relative" ref={storePickerRef}>
      <Button
        id={storePickerBtnId}
        type="button"
        size="sm"
        variant="outline"
        className="min-w-[220px] justify-between"
        aria-expanded={storePickerOpen}
        aria-controls={storePickerListId}
        aria-haspopup="dialog"
        onClick={() => setStorePickerOpen((prev) => !prev)}
      >
        <span className="truncate text-left">
          {selectedStores.length === 0
            ? storePickerPlaceholder
            : selectedStores.length === posBizDayStoreChoices.length &&
                posBizDayStoreChoices.length > 1
              ? canFranchiseeMultiStore
                ? tr("salesSelectMyFranchiseStoresAll", "내 매장 전체")
                : tr("salesSelectStoreAll", "전체 매장")
              : selectedStores.length === 1
                ? posStoreDisplayName(selectedStores[0]!)
                : `${selectedStores.length}${tr("selected", "개 선택")}`}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{storePickerOpen ? "▲" : "▼"}</span>
      </Button>
      {storePickerOpen ? (
        <div
          id={storePickerListId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={storePickerBtnId}
          className="absolute z-20 mt-2 w-[320px] rounded-md border bg-background p-2 shadow-lg"
        >
          <Input
            value={storeSearch}
            onChange={(e) => setStoreSearch(e.target.value)}
            placeholder={tr("salesStoreSearch", "매장 검색")}
            className="mb-2 h-8"
          />
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={handleSelectAll}>
              {tr("salesStoreSelectAll", "전체 선택")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleClearAll}>
              {tr("salesStoreDeselectAll", "전체 해제")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_XS_CN}
              onClick={() => setStorePickerOpen(false)}
            >
              {tr("close", "닫기")}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded border p-1">
            {filteredStoreOptions.map((p) => {
              const checked = selectedStores.includes(p)
              return (
                <label
                  key={p}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      const exists = selectedStores.includes(p)
                      const next = exists
                        ? selectedStores.filter((x) => x !== p)
                        : [...selectedStores, p]
                      onStoresChange(normalizeStoreCodes(next))
                    }}
                  />
                  <span className="text-sm">{posStoreDisplayName(p)}</span>
                </label>
              )
            })}
            {filteredStoreOptions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {tr("salesNoStoreResult", "검색 결과 없음")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
