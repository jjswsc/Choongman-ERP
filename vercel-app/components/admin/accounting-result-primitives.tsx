"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  accountingEmptyStateCn,
  accountingLedgerEntryGridCn,
  accountingPeriodChipCn,
  accountingResultTableCn,
  accountingResultTableShellCn,
  accountingResultTbodyRowCn,
  accountingResultTfootRowCn,
  accountingResultTheadRowCn,
  accountingStatCardCn,
  accountingStatGridCn,
  accountingStatLabelCn,
  accountingStatToneClass,
  accountingStatValueCn,
} from "@/lib/accounting-result-ui"

export function AccountingEmptyState({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(accountingEmptyStateCn, className)}>{children}</div>
}

export function AccountingPeriodChip({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(accountingPeriodChipCn, className)}>{children}</div>
}

export function AccountingStatGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(accountingStatGridCn, className)}>{children}</div>
}

export function AccountingStatCard({
  label,
  value,
  tone = "default",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  tone?: "default" | "warn" | "ok"
  className?: string
}) {
  return (
    <div className={cn(accountingStatCardCn, className)}>
      <div className={accountingStatLabelCn}>{label}</div>
      <div className={cn(accountingStatValueCn, accountingStatToneClass(tone))}>{value}</div>
    </div>
  )
}

export function AccountingTableShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(accountingResultTableShellCn, className)}>
      <table className={accountingResultTableCn}>{children}</table>
    </div>
  )
}

export function AccountingTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className={accountingResultTheadRowCn}>{children}</tr>
    </thead>
  )
}

export function AccountingTableBodyRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tr className={cn(accountingResultTbodyRowCn, className)}>{children}</tr>
}

export function AccountingTableFootRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tr className={cn(accountingResultTfootRowCn, className)}>{children}</tr>
}

export function AccountingLedgerEntryCard({
  children,
  className,
  entryIndex,
}: {
  children: React.ReactNode
  className?: string
  /** 0-based — zebra 배경 */
  entryIndex?: number
}) {
  return (
    <div
      className={cn(
        accountingLedgerEntryGridCn,
        entryIndex != null && entryIndex % 2 === 1 ? "bg-muted/15" : "",
        className
      )}
    >
      {children}
    </div>
  )
}
