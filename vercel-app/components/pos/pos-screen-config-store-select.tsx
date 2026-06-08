"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { labelForStore } from "@/lib/store-list-keys"
import { cn } from "@/lib/utils"

export type PosScreenConfigStoreOption = { code: string; label: string }

function formatStoreOptionLabel(code: string, label: string): string {
  const c = String(code || "").trim()
  const l = String(label || "").trim()
  if (!c) return l
  if (!l || l === c) return c
  return `${l} (${c})`
}

export function PosScreenConfigStoreSelect({
  value,
  onValueChange,
  stores,
  storeLabels,
  storeOptions,
  disabled,
  className,
  searchPlaceholder,
}: {
  value: string | undefined
  onValueChange: (v: string) => void
  stores: string[]
  storeLabels?: Record<string, string>
  storeOptions?: PosScreenConfigStoreOption[]
  disabled?: boolean
  className?: string
  searchPlaceholder?: string
}) {
  const [search, setSearch] = React.useState("")

  const options = React.useMemo(() => {
    if (storeOptions?.length) return storeOptions
    return stores.map((code) => ({
      code,
      label: storeLabels ? labelForStore(storeLabels, code) : code,
    }))
  }, [storeLabels, storeOptions, stores])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((opt) => {
      const code = opt.code.toLowerCase()
      const label = opt.label.toLowerCase()
      return code.includes(q) || label.includes(q)
    })
  }, [options, search])

  const selectedLabel = React.useMemo(() => {
    const code = String(value || "").trim()
    if (!code) return ""
    const opt = options.find((o) => o.code === code)
    return opt ? formatStoreOptionLabel(opt.code, opt.label) : code
  }, [options, value])

  return (
    <Select
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled || options.length === 0}
      onOpenChange={(open) => {
        if (!open) setSearch("")
      }}
    >
      <SelectTrigger className={cn("h-10 min-w-[11rem] max-w-xs text-sm", className)}>
        <SelectValue placeholder={searchPlaceholder || "매장"}>{selectedLabel || undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[min(24rem,70vh)]">
        <div className="border-b p-1.5" onClick={(e) => e.stopPropagation()}>
          <Input
            placeholder={searchPlaceholder || "검색"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            autoComplete="off"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">—</p>
        ) : (
          filtered.map((opt) => (
            <SelectItem key={opt.code} value={opt.code} className="text-sm">
              {formatStoreOptionLabel(opt.code, opt.label)}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
