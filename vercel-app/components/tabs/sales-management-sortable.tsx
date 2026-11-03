"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

export type SalesSortDir = "asc" | "desc"

export function useSalesTableSort<K extends string>(
  initialKey: K,
  initialDir: SalesSortDir = "desc"
) {
  const [sortKey, setSortKey] = React.useState<K>(initialKey)
  const [sortDir, setSortDir] = React.useState<SalesSortDir>(initialDir)

  const toggleSort = React.useCallback(
    (key: K) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
        return
      }
      setSortKey(key)
      // 새 열 첫 클릭 = 오름차순
      setSortDir("asc")
    },
    [sortKey]
  )

  return { sortKey, sortDir, toggleSort, setSortKey, setSortDir }
}

export function sortSalesRows<T>(
  rows: readonly T[],
  dir: SalesSortDir,
  getValue: (row: T) => string | number | null | undefined,
  tieBreak?: (a: T, b: T) => number
): T[] {
  const mul = dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = getValue(a)
    const vb = getValue(b)
    let cmp = 0
    if (typeof va === "string" || typeof vb === "string") {
      cmp = String(va ?? "").localeCompare(String(vb ?? ""), undefined, {
        sensitivity: "base",
        numeric: true,
      })
    } else {
      const na = Number(va)
      const nb = Number(vb)
      const aOk = Number.isFinite(na)
      const bOk = Number.isFinite(nb)
      if (!aOk && !bOk) cmp = 0
      else if (!aOk) cmp = 1
      else if (!bOk) cmp = -1
      else cmp = na - nb
    }
    if (cmp !== 0) return cmp * mul
    return tieBreak ? tieBreak(a, b) : 0
  })
}

export function SalesSortableTh({
  label,
  active,
  dir,
  align = "right",
  muted,
  className = "",
  onClick,
}: {
  label: React.ReactNode
  active: boolean
  dir: SalesSortDir
  align?: "left" | "right" | "center"
  muted?: boolean
  className?: string
  onClick: () => void
}) {
  const icon = !active ? (
    <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
  ) : dir === "asc" ? (
    <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
  ) : (
    <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
  )
  const alignCn =
    align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right"
  return (
    <th
      className={`px-2 py-2 ${alignCn} ${muted ? "text-muted-foreground font-normal" : ""} ${className}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={`inline-flex max-w-full items-center gap-1 rounded hover:text-foreground ${
          align === "left" ? "" : align === "center" ? "mx-auto" : "flex-row-reverse"
        } ${muted ? "text-[11px]" : "text-xs font-semibold"}`}
        onClick={onClick}
      >
        <span className="truncate whitespace-nowrap">{label}</span>
        {icon}
      </button>
    </th>
  )
}
