"use client"

import * as React from "react"
import { ArrowDownAZ, ArrowUpZA, Filter, Search } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type VendorColumnOption = { value: string; label: string }

export function VendorColumnFilter({
  options,
  selected,
  onChange,
  onSortAsc,
  onSortDesc,
  searchPlaceholder,
  selectAllLabel,
  clearLabel,
  sortAscLabel,
  sortDescLabel,
  filterLabel,
}: {
  options: VendorColumnOption[]
  selected: ReadonlySet<string> | null
  onChange: (next: Set<string> | null) => void
  onSortAsc: () => void
  onSortDesc: () => void
  searchPlaceholder: string
  selectAllLabel: string
  clearLabel: string
  sortAscLabel: string
  sortDescLabel: string
  filterLabel: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const allValues = React.useMemo(() => options.map((o) => o.value), [options])
  const selectedSet = selected ?? new Set(allValues)
  const isFiltered = selected != null

  const visibleOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    )
  }, [options, query])

  const visibleValues = visibleOptions.map((o) => o.value)
  const allVisibleChecked =
    visibleValues.length > 0 && visibleValues.every((value) => selectedSet.has(value))

  const commit = (next: Set<string>) => {
    if (allValues.length > 0 && next.size === allValues.length && allValues.every((value) => next.has(value))) {
      onChange(null)
      return
    }
    onChange(new Set(next))
  }

  const toggleValue = (value: string, checked: boolean) => {
    const next = new Set(selectedSet)
    if (checked) next.add(value)
    else next.delete(value)
    commit(next)
  }

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedSet)
    if (allVisibleChecked) {
      for (const value of visibleValues) next.delete(value)
    } else {
      for (const value of visibleValues) next.add(value)
    }
    commit(next)
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground",
            isFiltered && "text-primary hover:text-primary"
          )}
          title={filterLabel}
          aria-label={filterLabel}
        >
          <Filter className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onSortAsc()
          }}
        >
          <ArrowDownAZ className="h-3.5 w-3.5" />
          {sortAscLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onSortDesc()
          }}
        >
          <ArrowUpZA className="h-3.5 w-3.5" />
          {sortDescLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-1.5 pb-1.5" onKeyDown={(e) => e.stopPropagation()}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-7 text-[11px]"
            />
          </div>
        </div>
        <DropdownMenuCheckboxItem
          checked={allVisibleChecked}
          onCheckedChange={toggleSelectAllVisible}
          onSelect={(e) => e.preventDefault()}
          className="text-xs font-semibold"
        >
          {selectAllLabel}
        </DropdownMenuCheckboxItem>
        <div className="max-h-52 overflow-y-auto">
          {visibleOptions.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">—</div>
          ) : (
            visibleOptions.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={selectedSet.has(option.value)}
                onCheckedChange={(checked) => toggleValue(option.value, checked === true)}
                onSelect={(e) => e.preventDefault()}
                className="text-xs"
              >
                <span className="truncate" title={option.label}>
                  {option.label}
                </span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
        {isFiltered ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onChange(null)
                setQuery("")
              }}
              className="text-xs text-muted-foreground"
            >
              {clearLabel}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
