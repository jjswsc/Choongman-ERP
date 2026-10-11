"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  SALES_ORDER_TYPE_TOGGLES,
  PERIOD_GROUP,
  I18N_KO,
} from "@/components/tabs/sales-management-shared"
import {
  POS_SALES_DOW_TOGGLE_ORDER,
  POS_SALES_DOW_LABEL_KEYS,
  type PosSalesDowValue,
} from "@/lib/pos-sales-dow-filter"
import type { PosOrderTypeValue } from "@/lib/pos-sales-order-type-filter"
import type { PeriodGroupValue } from "@/components/tabs/sales-management-ia"
import type { SalesUserSelection } from "@/components/tabs/sales-management-view-types"

export interface SalesManagementFiltersDesktopProps {
  hideOrderTypeFilter: boolean
  tr: (key: string, fallback: string) => string
  orderTypesKey: string
  setSalesAllOrderTypes: () => void
  toggleOrderTypeChannel: (t: PosOrderTypeValue) => void
  needsPeriodGroup: boolean
  periodGroupUi: PeriodGroupValue
  userSelectedRef: React.RefObject<SalesUserSelection>
  setPeriodGroup: React.Dispatch<React.SetStateAction<PeriodGroupValue>>
  showDowFilter: boolean
  dowsKey: string
  setSalesAllDows: () => void
  toggleDowFilter: (d: PosSalesDowValue) => void
}

export function SalesManagementFiltersDesktop({
  hideOrderTypeFilter,
  tr,
  orderTypesKey,
  setSalesAllOrderTypes,
  toggleOrderTypeChannel,
  needsPeriodGroup,
  periodGroupUi,
  userSelectedRef,
  setPeriodGroup,
  showDowFilter,
  dowsKey,
  setSalesAllDows,
  toggleDowFilter,
}: SalesManagementFiltersDesktopProps) {
  return (
    <div className="mb-3 hidden rounded-lg border bg-muted/20 p-3 md:block">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {!hideOrderTypeFilter ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 text-sm font-medium">
            {tr("salesAmountKindLabel", "매출액 종류")}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={orderTypesKey === "" ? "default" : "outline"}
              onClick={setSalesAllOrderTypes}
            >
              {tr("salesAmountKindAll", "전체")}
            </Button>
            {SALES_ORDER_TYPE_TOGGLES.map(({ type, labelKey, fallback }) => {
              const active = orderTypesKey !== "" && orderTypesKey.split(",").includes(type)
              return (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => toggleOrderTypeChannel(type)}
                >
                  {tr(labelKey, fallback)}
                </Button>
              )
            })}
          </div>
        </div>
        ) : null}
        {needsPeriodGroup ? (
          <>
            <span className="hidden h-4 w-px shrink-0 bg-border sm:inline-block" aria-hidden />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0 text-sm font-medium">
                {tr("salesPeriodGranularityLabel", "집계 기간")}
              </span>
              <div className="flex flex-wrap gap-2">
                {PERIOD_GROUP.map((g) => (
                  <Button
                    key={g.value}
                    size="sm"
                    variant={periodGroupUi === g.value ? "default" : "outline"}
                    onClick={() => {
                      userSelectedRef.current.periodGroup = g.value
                      setPeriodGroup(g.value)
                    }}
                  >
                    {tr(g.labelKey, I18N_KO[g.labelKey] ?? g.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {showDowFilter ? (
          <>
            <span className="hidden h-4 w-px shrink-0 bg-border sm:inline-block" aria-hidden />
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0 text-sm font-medium">
                {tr("salesDowFilterLabel", "요일")}
              </span>
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
          </>
        ) : null}
      </div>
    </div>
  )
}
