"use client"

import * as React from "react"
import { SalesPeriodTrendChartBlock } from "@/components/tabs/sales-management-charts"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { formatSalesAmount } from "@/components/tabs/sales-management-shared"
import type {
  SalesMenuDataRow,
  SalesPeriodBarXAxisProps,
  SalesPeriodChartRow,
  SalesPeriodChartYAxisProps,
} from "@/components/tabs/sales-management-view-types"

export interface SalesMenuViewProps {
  periodChartRows: SalesPeriodChartRow[]
  periodBarXAxisProps: SalesPeriodBarXAxisProps
  periodChartYAxisProps: SalesPeriodChartYAxisProps
  tr: (key: string, fallback: string) => string
  menuSearch: string
  setMenuSearch: React.Dispatch<React.SetStateAction<string>>
  menuSearchAnd: boolean
  setMenuSearchAnd: React.Dispatch<React.SetStateAction<boolean>>
  startStr: string
  endStr: string
  selectedStoresKey: string
  menuData: SalesMenuDataRow[]
}

export function SalesMenuView({
  periodChartRows,
  periodBarXAxisProps,
  periodChartYAxisProps,
  tr,
  menuSearch,
  setMenuSearch,
  menuSearchAnd,
  setMenuSearchAnd,
  startStr,
  endStr,
  selectedStoresKey,
  menuData,
}: SalesMenuViewProps) {
  return (
    <>
      <SalesPeriodTrendChartBlock
        rows={periodChartRows}
        periodBarXAxisProps={periodBarXAxisProps}
        periodChartYAxisProps={periodChartYAxisProps}
        tr={tr}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder={tr("salesMenuSearch", "메뉴 검색")}
          value={menuSearch}
          onChange={(e) => setMenuSearch(e.target.value)}
          className="w-48 min-w-[12rem]"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={menuSearchAnd}
            onCheckedChange={(c) => setMenuSearchAnd(c === true)}
          />
          <span>{tr("salesMenuSearchAndMode", "검색어 모두 포함 (AND)")}</span>
        </label>
        <Button asChild size="sm" variant="outline">
          <Link
            href={`/admin/total-sales?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}${selectedStoresKey ? `&stores=${encodeURIComponent(selectedStoresKey)}` : ""}`}
          >
            {tr("salesOverviewLinkTotalSales", "메뉴별 상세 (Total Sales)")}
          </Link>
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-2 text-left">{tr("salesMenu", "메뉴")}</th>
            <th className="py-2 text-right">{tr("salesQuantity", "수량")}</th>
            <th className="py-2 text-right">{tr("pL_sales", "매출")}</th>
          </tr>
        </thead>
        <tbody>
          {menuData.slice(0, 100).map((r) => (
            <tr key={r.name} className="border-b">
              <td className="py-1.5">{r.name}</td>
              <td className="py-1.5 text-right font-erp-numeric">
                {r.qty.toLocaleString()}
              </td>
              <td className="py-1.5 text-right font-erp-numeric">
                {formatSalesAmount(r.sales)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {menuData.length > 100 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {tr("salesTop100Only", "상위 100개만 표시")}
        </p>
      )}
    </>
  )
}
