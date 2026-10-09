"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import type * as React from "react"
import type { TrialBalanceRow } from "@/lib/api-client"

export type AccountingComplianceTrialTabProps = {
  isOffice: boolean
  loading: boolean
  loadTrial: () => Promise<void>
  setStoreTb: (v: string) => void
  setYearMonthTb: React.Dispatch<React.SetStateAction<string>>
  storeOptionLabel: (code: string) => string
  storeOptions: string[]
  storeTb: string
  t: (k: string) => string
  tbRows: TrialBalanceRow[]
  tbTotals: { debit: number; credit: number; diff: number; }
  yearMonthTb: string
}

export function AccountingComplianceTrialTab({
  isOffice,
  loading,
  loadTrial,
  setStoreTb,
  setYearMonthTb,
  storeOptionLabel,
  storeOptions,
  storeTb,
  t,
  tbRows,
  tbTotals,
  yearMonthTb,
}: AccountingComplianceTrialTabProps) {
  return (
    <>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
          <Input
            type="month"
            className="h-9 w-[160px]"
            value={yearMonthTb}
            onChange={(e) => setYearMonthTb(e.target.value)}
          />
        </div>
        {isOffice && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
            <Select value={storeTb} onValueChange={setStoreTb}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storeOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {storeOptionLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="button" variant="secondary" onClick={() => void loadTrial()} disabled={loading}>
          {t("search")}
        </Button>
      </div>
      <div className="text-sm flex flex-wrap gap-4">
        <span>
          {t("accCompTrialDebit")}: <b>{tbTotals.debit.toLocaleString()}</b>
        </span>
        <span>
          {t("accCompTrialCredit")}: <b>{tbTotals.credit.toLocaleString()}</b>
        </span>
        <span>
          {t("accCompTrialDiff")}: <b>{tbTotals.diff.toLocaleString()}</b>
        </span>
      </div>
      <Card>
        <CardContent className="p-0">
          <AdminTableScroll lockViewport={false} className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left p-2">{t("accCompColCode")}</th>
                <th className="text-left p-2">{t("accCompColName")}</th>
                <th className="text-right p-2">{t("accCompColDebit")}</th>
                <th className="text-right p-2">{t("accCompColCredit")}</th>
                <th className="text-right p-2">{t("accCompColNetDr")}</th>
              </tr>
            </thead>
            <tbody>
              {tbRows.map((r) => (
                <tr key={r.accountCode} className="border-b border-border/50">
                  <td className="p-2 font-mono">{r.accountCode}</td>
                  <td className="p-2">{r.accountName}</td>
                  <td className="p-2 text-right">{r.debit.toLocaleString()}</td>
                  <td className="p-2 text-right">{r.credit.toLocaleString()}</td>
                  <td className="p-2 text-right">{r.netDebit.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </AdminTableScroll>
        </CardContent>
      </Card>
    </>
  )
}
