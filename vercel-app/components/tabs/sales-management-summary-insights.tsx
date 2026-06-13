"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ADMIN_NUMERIC_CN } from "@/lib/admin-ui-standards"
import { displayPosCancelReasonKey } from "@/lib/pos-cancel-reason-key"
import { formatSalesAmount } from "./sales-management-shared"

type InsightMenuRow = { name: string; sales: number }
type InsightChannelRow = { channelKey: string; axisLabel: string; sales: number }
type CancelReasonRow = { reason: string; count: number; amount: number }

export type SalesManagementSummaryInsightsProps = {
  tr: (key: string, fallback: string) => string
  summaryRowShowFull: boolean
  summaryRowShowCurrentOnly: boolean
  summaryCardsCurrentDisplay: number
  summaryCards: { prevRange: number; prevWeek: number }
  activeSummaryCurrent: number
  insightShowTotals: boolean
  insightShowMenu: boolean
  insightShowChannel: boolean
  activeTotalsSummary: {
    gross: number
    discount: number
    service: number
    total: number
  }
  insightTopMenus: InsightMenuRow[]
  insightBottomMenus: InsightMenuRow[]
  insightTopChannels: InsightChannelRow[]
  cancelReasonSummary: {
    lineRows: CancelReasonRow[]
    orderRows: CancelReasonRow[]
    lineTotalCount: number
    lineTotalAmount: number
    orderTotalCount: number
    orderTotalAmount: number
    truncated: boolean
  }
  showInsightPanel: boolean
  onCancelReasonDrilldown: (reason: string, kind: "line" | "order") => void
}

export function SalesManagementSummaryInsights({
  tr,
  summaryRowShowFull,
  summaryRowShowCurrentOnly,
  summaryCardsCurrentDisplay,
  summaryCards,
  activeSummaryCurrent,
  insightShowTotals,
  insightShowMenu,
  insightShowChannel,
  activeTotalsSummary,
  insightTopMenus,
  insightBottomMenus,
  insightTopChannels,
  cancelReasonSummary,
  showInsightPanel,
  onCancelReasonDrilldown,
}: SalesManagementSummaryInsightsProps) {
  return (
    <>
      {summaryRowShowFull ? (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {tr("salesSummaryCurrent", "현재 기간 매출")}
              </CardTitle>
            </CardHeader>
            <CardContent className={`text-xl font-semibold ${ADMIN_NUMERIC_CN}`}>
              {formatSalesAmount(summaryCardsCurrentDisplay)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {tr("salesSummaryPrevRange", "직전 동일기간")}
              </CardTitle>
            </CardHeader>
            <CardContent className={`text-lg font-semibold ${ADMIN_NUMERIC_CN}`}>
              {formatSalesAmount(summaryCards.prevRange)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {tr("salesSummaryPrevWeek", "전주 동기간")}
              </CardTitle>
            </CardHeader>
            <CardContent className={`text-lg font-semibold ${ADMIN_NUMERIC_CN}`}>
              {formatSalesAmount(summaryCards.prevWeek)}
            </CardContent>
          </Card>
        </div>
      ) : summaryRowShowCurrentOnly ? (
        <Card className="mb-3 max-w-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {tr("salesSummaryCurrent", "현재 기간 매출")}
            </CardTitle>
          </CardHeader>
          <CardContent className={`text-xl font-semibold ${ADMIN_NUMERIC_CN}`}>
            {formatSalesAmount(activeSummaryCurrent)}
          </CardContent>
        </Card>
      ) : null}

      {showInsightPanel &&
      (insightShowTotals || insightShowMenu || insightShowChannel ||
      cancelReasonSummary.lineRows.length > 0 ||
      cancelReasonSummary.orderRows.length > 0) ? (
        <div className="mb-3 grid gap-3 lg:grid-cols-2">
          {insightShowTotals ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{tr("salesNetResult", "순매출")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tr("salesNetGross", "총액(공급+세금)")}</span>
                  <span className={`font-semibold ${ADMIN_NUMERIC_CN}`}>
                    {formatSalesAmount(activeTotalsSummary.gross)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tr("salesNetDiscount", "할인")}</span>
                  <span className={`font-semibold ${ADMIN_NUMERIC_CN}`}>
                    -{formatSalesAmount(activeTotalsSummary.discount)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tr("salesServiceAmount", "서비스처리 금액")}</span>
                  <span className={`font-semibold ${ADMIN_NUMERIC_CN}`}>
                    -{formatSalesAmount(activeTotalsSummary.service)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t pt-2">
                  <span className="font-medium">{tr("salesNetResult", "순매출")}</span>
                  <span className={`text-base font-bold ${ADMIN_NUMERIC_CN}`}>
                    {formatSalesAmount(activeTotalsSummary.total)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {insightShowMenu ? (
            <Card>
              <CardContent className="space-y-3 pt-4">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {tr("salesInsightTopMenu", "TOP 메뉴")}
                  </p>
                  {insightTopMenus.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {insightTopMenus.map((row) => (
                        <li key={`top-${row.name}`} className="flex justify-between gap-2">
                          <span className="truncate">{row.name}</span>
                          <span className={`shrink-0 font-medium ${ADMIN_NUMERIC_CN}`}>
                            {formatSalesAmount(row.sales)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {tr("salesInsightBottomMenu", "LOW 메뉴")}
                  </p>
                  {insightBottomMenus.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {insightBottomMenus.map((row) => (
                        <li key={`low-${row.name}`} className="flex justify-between gap-2">
                          <span className="truncate">{row.name}</span>
                          <span className={`shrink-0 font-medium ${ADMIN_NUMERIC_CN}`}>
                            {formatSalesAmount(row.sales)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {insightShowChannel ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {tr("salesInsightTopChannel", "TOP 채널")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {insightTopChannels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tr("salesDataNone", "데이터 없음")}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {insightTopChannels.map((row) => (
                      <li key={`ch-${row.channelKey}`} className="flex justify-between gap-2">
                        <span className="truncate">{row.axisLabel}</span>
                        <span className={`shrink-0 font-medium ${ADMIN_NUMERIC_CN}`}>
                          {formatSalesAmount(row.sales)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}

          {cancelReasonSummary.lineRows.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {tr("salesCancelReasonTopLine", "품목 취소 사유 TOP")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {cancelReasonSummary.lineRows.slice(0, 5).map((row) => (
                    <li key={`line-${row.reason}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50"
                        onClick={() => onCancelReasonDrilldown(row.reason, "line")}
                      >
                        <span className="truncate">
                          {displayPosCancelReasonKey(row.reason, tr("posCancelReasonNotSet", "사유 미입력"))} (
                          {row.count}
                          {tr("posCount", "건")})
                        </span>
                        <span className={`shrink-0 font-medium ${ADMIN_NUMERIC_CN}`}>
                          {formatSalesAmount(row.amount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {cancelReasonSummary.orderRows.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  {tr("salesCancelReasonTopOrder", "주문 전체 취소 사유 TOP")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {cancelReasonSummary.orderRows.slice(0, 5).map((row) => (
                    <li key={`order-${row.reason}`}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50"
                        onClick={() => onCancelReasonDrilldown(row.reason, "order")}
                      >
                        <span className="truncate">
                          {displayPosCancelReasonKey(row.reason, tr("posCancelReasonNotSet", "사유 미입력"))} (
                          {row.count}
                          {tr("posCount", "건")})
                        </span>
                        <span className={`shrink-0 font-medium ${ADMIN_NUMERIC_CN}`}>
                          {formatSalesAmount(row.amount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
