"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  POS_SALES_DOW_TOGGLE_ORDER,
  POS_SALES_DOW_LABEL_KEYS,
  type PosSalesDowValue,
} from "@/lib/pos-sales-dow-filter"
import { I18N_KO } from "@/components/tabs/sales-management-shared"
import type { PosOrderTypeValue } from "@/lib/pos-sales-order-type-filter"
import type { PeriodGroupValue } from "@/components/tabs/sales-management-ia"
import type { SalesUserSelection } from "@/components/tabs/sales-management-view-types"

export interface SalesManagementFiltersMobileProps {
  hideOrderTypeFilter: boolean
  tr: (key: string, fallback: string) => string
  orderTypesPickerRef: React.RefObject<HTMLDivElement | null>
  orderTypesPickerBtnId: string
  orderTypesPickerOpen: boolean
  orderTypesPickerListId: string
  setSalesNavPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setOrderTypesPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  setOrderTypesQuery: React.Dispatch<React.SetStateAction<string>>
  setPeriodPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  orderTypesSummaryLabel: string
  orderTypesQuery: string
  filteredOrderTypesPickerRows: { kind: "all" | "type"; type?: PosOrderTypeValue; label: string; haystack: string }[]
  orderTypesKey: string
  setSalesAllOrderTypes: () => void
  toggleOrderTypeChannel: (t: PosOrderTypeValue) => void
  needsPeriodGroup: boolean
  periodPickerRef: React.RefObject<HTMLDivElement | null>
  periodPickerBtnId: string
  periodPickerOpen: boolean
  periodPickerListId: string
  setPeriodQuery: React.Dispatch<React.SetStateAction<string>>
  periodPickerFlatRows: { value: "year" | "month" | "week" | "day" | "hour" | "dow"; label: string; haystack: string }[]
  periodGroupUi: PeriodGroupValue
  periodQuery: string
  filteredPeriodPickerRows: { value: "year" | "month" | "week" | "day" | "hour" | "dow"; label: string; haystack: string }[]
  userSelectedRef: React.RefObject<SalesUserSelection>
  setPeriodGroup: React.Dispatch<React.SetStateAction<PeriodGroupValue>>
  showDowFilter: boolean
  dowsKey: string
  setSalesAllDows: () => void
  toggleDowFilter: (d: PosSalesDowValue) => void
}

export function SalesManagementFiltersMobile({
  hideOrderTypeFilter,
  tr,
  orderTypesPickerRef,
  orderTypesPickerBtnId,
  orderTypesPickerOpen,
  orderTypesPickerListId,
  setSalesNavPickerOpen,
  setOrderTypesPickerOpen,
  setOrderTypesQuery,
  setPeriodPickerOpen,
  orderTypesSummaryLabel,
  orderTypesQuery,
  filteredOrderTypesPickerRows,
  orderTypesKey,
  setSalesAllOrderTypes,
  toggleOrderTypeChannel,
  needsPeriodGroup,
  periodPickerRef,
  periodPickerBtnId,
  periodPickerOpen,
  periodPickerListId,
  setPeriodQuery,
  periodPickerFlatRows,
  periodGroupUi,
  periodQuery,
  filteredPeriodPickerRows,
  userSelectedRef,
  setPeriodGroup,
  showDowFilter,
  dowsKey,
  setSalesAllDows,
  toggleDowFilter,
}: SalesManagementFiltersMobileProps) {
  return (
    <div className="mb-3 space-y-4 rounded-lg border bg-muted/20 p-3 md:hidden">
      {!hideOrderTypeFilter ? (
      <div className="space-y-2">
        <span className="text-sm font-medium">{tr("salesAmountKindLabel", "매출액 종류")}</span>
        <div className="relative" ref={orderTypesPickerRef}>
          <Button
            id={orderTypesPickerBtnId}
            type="button"
            variant="outline"
            className="h-10 w-full justify-between gap-2"
            aria-expanded={orderTypesPickerOpen}
            aria-controls={orderTypesPickerListId}
            aria-haspopup="dialog"
            onClick={() => {
              setSalesNavPickerOpen(false)
              setOrderTypesPickerOpen((prev) => {
                const next = !prev
                if (next) setOrderTypesQuery("")
                return next
              })
              setPeriodPickerOpen(false)
            }}
          >
            <span className="min-w-0 truncate text-left text-sm font-medium">{orderTypesSummaryLabel}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{orderTypesPickerOpen ? "▲" : "▼"}</span>
          </Button>
          {orderTypesPickerOpen ? (
            <div
              id={orderTypesPickerListId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={orderTypesPickerBtnId}
              className="absolute z-30 mt-1 w-full rounded-lg border bg-background shadow-lg"
            >
              <div className="border-b p-2">
                <Input
                  value={orderTypesQuery}
                  onChange={(e) => setOrderTypesQuery(e.target.value)}
                  placeholder={tr("salesFilterOrderTypeSearchPh", "매출액 종류 검색…")}
                  className="h-9"
                  autoFocus
                />
              </div>
              <ul className="max-h-[min(50vh,280px)] overflow-y-auto py-1" role="listbox">
                {filteredOrderTypesPickerRows.length === 0 ? (
                  <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {tr("salesDataNone", "데이터 없음")}
                  </li>
                ) : (
                  filteredOrderTypesPickerRows.map((row) => {
                    if (row.kind === "all") {
                      const activeAll = orderTypesKey === ""
                      return (
                        <li key="all" role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={activeAll}
                            className={
                              "flex w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/80 " +
                              (activeAll ? "bg-muted" : "")
                            }
                            onClick={() => {
                              setSalesAllOrderTypes()
                            }}
                          >
                            {row.label}
                          </button>
                        </li>
                      )
                    }
                    const type = row.type!
                    const active = orderTypesKey !== "" && orderTypesKey.split(",").includes(type)
                    return (
                      <li key={type} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={
                            "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/80 " +
                            (active ? "bg-muted" : "")
                          }
                          onClick={() => toggleOrderTypeChannel(type)}
                        >
                          <span className="font-medium">{row.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {active ? "✓" : ""}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      ) : null}
      {needsPeriodGroup ? (
        <div className="space-y-2">
          <span className="text-sm font-medium">{tr("salesPeriodGranularityLabel", "집계 기간")}</span>
          <div className="relative" ref={periodPickerRef}>
            <Button
              id={periodPickerBtnId}
              type="button"
              variant="outline"
              className="h-10 w-full justify-between gap-2"
              aria-expanded={periodPickerOpen}
              aria-controls={periodPickerListId}
              aria-haspopup="dialog"
              onClick={() => {
                setSalesNavPickerOpen(false)
                setPeriodPickerOpen((prev) => {
                  const next = !prev
                  if (next) setPeriodQuery("")
                  return next
                })
                setOrderTypesPickerOpen(false)
              }}
            >
              <span className="min-w-0 truncate text-left text-sm font-medium">
                {periodPickerFlatRows.find((r) => r.value === periodGroupUi)?.label ?? periodGroupUi}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{periodPickerOpen ? "▲" : "▼"}</span>
            </Button>
            {periodPickerOpen ? (
              <div
                id={periodPickerListId}
                role="dialog"
                aria-modal="false"
                aria-labelledby={periodPickerBtnId}
                className="absolute z-30 mt-1 w-full rounded-lg border bg-background shadow-lg"
              >
                <div className="border-b p-2">
                  <Input
                    value={periodQuery}
                    onChange={(e) => setPeriodQuery(e.target.value)}
                    placeholder={tr("salesFilterPeriodSearchPh", "집계 기간 검색…")}
                    className="h-9"
                    autoFocus
                  />
                </div>
                <ul className="max-h-[min(50vh,280px)] overflow-y-auto py-1" role="listbox">
                  {filteredPeriodPickerRows.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      {tr("salesDataNone", "데이터 없음")}
                    </li>
                  ) : (
                    filteredPeriodPickerRows.map((row) => {
                      const active = periodGroupUi === row.value
                      return (
                        <li key={row.value} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={
                              "flex w-full px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/80 " +
                              (active ? "bg-muted" : "")
                            }
                            onClick={() => {
                              userSelectedRef.current.periodGroup = row.value
                              setPeriodGroup(row.value)
                              setPeriodPickerOpen(false)
                              setPeriodQuery("")
                            }}
                          >
                            {row.label}
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {showDowFilter ? (
        <div className="space-y-2">
          <span className="text-sm font-medium">{tr("salesDowFilterLabel", "요일")}</span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={dowsKey === "" ? "default" : "outline"}
              onClick={setSalesAllDows}
            >
              {tr("salesDowFilterAll", "전체")}
            </Button>
            {POS_SALES_DOW_TOGGLE_ORDER.map((d) => {
              const active = dowsKey !== "" && dowsKey.split(",").includes(String(d))
              const labelKey = POS_SALES_DOW_LABEL_KEYS[d]
              return (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => toggleDowFilter(d)}
                >
                  {tr(labelKey, I18N_KO[labelKey] ?? String(d))}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
