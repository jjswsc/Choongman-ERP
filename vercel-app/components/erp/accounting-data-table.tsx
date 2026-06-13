"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  accountingResultTableCn,
  accountingResultTableShellCn,
  accountingResultTdCn,
  accountingResultTdRightCn,
  accountingResultThCn,
  accountingResultThRightCn,
  accountingResultTheadRowCn,
  accountingResultTbodyRowCn,
  accountingResultTfootRowCn,
} from "@/lib/accounting-result-ui"

export function AccountingDataTable({
  children,
  className,
  tableClassName,
  minWidthClass,
  id,
}: {
  children: React.ReactNode
  className?: string
  tableClassName?: string
  minWidthClass?: string
  id?: string
}) {
  return (
    <div id={id} className={cn(accountingResultTableShellCn, "overflow-auto", className)}>
      <table className={cn(accountingResultTableCn, minWidthClass, tableClassName)}>
        {children}
      </table>
    </div>
  )
}

export function AccountingTheadRow({
  children,
  className,
  sticky,
}: {
  children: React.ReactNode
  className?: string
  sticky?: boolean
}) {
  return (
    <thead className={cn(sticky && "sticky top-0 z-[1] bg-muted/80 backdrop-blur-sm")}>
      <tr className={cn(accountingResultTheadRowCn, className)}>{children}</tr>
    </thead>
  )
}

export function AccountingTh({
  children,
  align = "left",
  className,
  title,
}: {
  children?: React.ReactNode
  align?: "left" | "right" | "center"
  className?: string
  title?: string
}) {
  return (
    <th
      title={title}
      className={cn(
        align === "right" ? accountingResultThRightCn : accountingResultThCn,
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  )
}

export function AccountingTbodyRow({
  children,
  className,
  id,
}: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return <tr id={id} className={cn(accountingResultTbodyRowCn, className)}>{children}</tr>
}

export function AccountingTfootRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <tr className={cn(accountingResultTfootRowCn, className)}>{children}</tr>
}

export function AccountingTd({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode
  align?: "left" | "right" | "center"
  className?: string
}) {
  return (
    <td
      className={cn(
        align === "right" ? accountingResultTdRightCn : accountingResultTdCn,
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  )
}
