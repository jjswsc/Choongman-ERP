"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { SalesStorePicker } from "@/components/tabs/sales-management-store-picker"
import { Button } from "@/components/ui/button"
import type { SalesUserSelection } from "@/components/tabs/sales-management-view-types"
import type { AuthState } from "@/lib/auth-context"

export interface SalesManagementQueryBarProps {
  startStr: string
  userSelectedRef: React.RefObject<SalesUserSelection>
  endStr: string
  setStartStr: React.Dispatch<React.SetStateAction<string>>
  setEndStr: React.Dispatch<React.SetStateAction<string>>
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
  posBizDayStoreChoices: string[]
  applyStoreSelection: (next: string[], meta?: { clearedAll?: boolean }) => void
  posStoreDisplayName: (code: string) => string
  filteredStoreOptions: string[]
  storeSearch: string
  setStoreSearch: React.Dispatch<React.SetStateAction<string>>
  canMultiStorePicker: boolean
  auth: AuthState | null
  loadAllAnalytics: (opts?: { silent?: boolean }) => void
  canQuerySales: boolean
  loading: boolean
  saveCurrentPreset: () => void
  showSalesResults: boolean
  canExportExcel: boolean
  handleExportExcel: () => Promise<void>
}

export function SalesManagementQueryBar({
  startStr,
  userSelectedRef,
  endStr,
  setStartStr,
  setEndStr,
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
  posBizDayStoreChoices,
  applyStoreSelection,
  posStoreDisplayName,
  filteredStoreOptions,
  storeSearch,
  setStoreSearch,
  canMultiStorePicker,
  auth,
  loadAllAnalytics,
  canQuerySales,
  loading,
  saveCurrentPreset,
  showSalesResults,
  canExportExcel,
  handleExportExcel,
}: SalesManagementQueryBarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex w-full flex-row items-center gap-2 sm:w-auto">
        <Input
          type="date"
          value={startStr}
          onChange={(e) => {
            const v = e.target.value
            userSelectedRef.current.dateRange = `${v}~${endStr}`
            setStartStr(v)
          }}
          className="h-9 min-w-0 flex-1 text-[13px] sm:w-[172px] sm:flex-none"
        />
        <span className="shrink-0 text-slate-500">~</span>
        <Input
          type="date"
          value={endStr}
          onChange={(e) => {
            const v = e.target.value
            userSelectedRef.current.dateRange = `${startStr}~${v}`
            setEndStr(v)
          }}
          className="h-9 min-w-0 flex-1 text-[13px] sm:w-[172px] sm:flex-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SalesStorePicker
          tr={tr}
          canSearchAll={canSearchAll}
          canFranchiseeMultiStore={canFranchiseeMultiStore}
          storePickerBtnId={storePickerBtnId}
          storePickerListId={storePickerListId}
          storePickerOpen={storePickerOpen}
          setStorePickerOpen={setStorePickerOpen}
          storePickerRef={storePickerRef}
          storePickerPlaceholder={storePickerPlaceholder}
          selectedStores={selectedStores}
          allStoreOptions={posBizDayStoreChoices}
          onStoresChange={applyStoreSelection}
          posBizDayStoreChoices={posBizDayStoreChoices}
          posStoreDisplayName={posStoreDisplayName}
          filteredStoreOptions={filteredStoreOptions}
          storeSearch={storeSearch}
          setStoreSearch={setStoreSearch}
          singleStoreLabel={
            posBizDayStoreChoices.length === 1
              ? posStoreDisplayName(posBizDayStoreChoices[0]!)
              : canMultiStorePicker
                ? undefined
                : posStoreDisplayName(selectedStores[0] ?? auth?.store ?? "") ||
                  tr("salesSelectStoreAll", "매장(전체)")
          }
        />
      </div>
      <div className="flex w-full gap-2 sm:contents">
        <Button
          size="sm"
          className="min-w-0 flex-[3] sm:flex-initial"
          onClick={() => loadAllAnalytics()}
          disabled={!canQuerySales || loading}
          title={
            canMultiStorePicker && selectedStores.length === 0
              ? tr("salesQueryNeedStore", "매장을 선택해 주세요.")
              : undefined
          }
        >
          {tr("salesQuery", "조회")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0 flex-[2] sm:flex-initial"
          onClick={saveCurrentPreset}
        >
          {tr("salesSavePreset", "조건 저장")}
        </Button>
      </div>
      {showSalesResults ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canExportExcel || loading}
          onClick={() => void handleExportExcel()}
        >
          {tr("salesExportExcel", "엑셀 다운로드")}
        </Button>
      ) : null}
    </div>
  )
}
