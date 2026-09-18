"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { tOr, useT } from "@/lib/i18n"
import {
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LogisticsEmptyState } from "@/components/erp/logistics-ui"
import { cn } from "@/lib/utils"
import { ADMIN_TABLE_SCROLL_VIEWPORT_CN } from "@/lib/admin-ui-standards"
import { VendorColumnFilter } from "@/components/erp/vendor-column-filter"
import {
  type VendorColumnFilters,
  type VendorListSortDir,
  type VendorListSortKey,
  applyVendorColumnFilters,
  sortVendorListRows,
  uniqueVendorColumnOptions,
  vendorColumnOptionRows,
  vendorListDisplayName,
} from "@/lib/vendor-sort"

export interface Vendor {
  code: string
  name: string
  gps_name?: string
  sales_outlet?: string
  contact: string
  phone: string
  email: string
  address: string
  tax_no?: string
  type: "purchase" | "sales" | "both" | "related"
  memo: string
  direct_settlement?: boolean
  bank_account_no?: string
  bank_name?: string
}

export type VendorTypeFilter = "all" | "purchase" | "sales" | "related"

export type VendorLinkedStore = {
  storeCode: string
  via: "vendor_code" | "sales_outlet" | "gps_name"
}

export interface VendorTableProps {
  vendors: Vendor[]
  hasSearched: boolean
  loading?: boolean
  searchTerm: string
  setSearchTerm: (v: string) => void
  typeFilter: VendorTypeFilter
  setTypeFilter: (v: VendorTypeFilter) => void
  onSearch: () => void
  onEdit: (vendor: Vendor) => void
  onDelete: (vendor: Vendor) => void
  linkedStoresByVendor?: Record<string, VendorLinkedStore[]>
}

export function VendorTable({
  vendors,
  hasSearched,
  loading = false,
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  onSearch,
  onEdit,
  onDelete,
  linkedStoresByVendor = {},
}: VendorTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [sortKey, setSortKey] = React.useState<VendorListSortKey>("name")
  const [sortDir, setSortDir] = React.useState<VendorListSortDir>("asc")
  const [columnFilters, setColumnFilters] = React.useState<VendorColumnFilters>({})

  const typeLabel = React.useCallback(
    (type: string) => {
      if (type === "purchase") return t("vendorTypePurchase")
      if (type === "sales") return t("vendorTypeSales")
      if (type === "related") return tOr(t, "vendorTypeRelated", "관련당사자")
      return t("vendorTypeBoth")
    },
    [t]
  )

  const columnFilteredVendors = React.useMemo(
    () => applyVendorColumnFilters(vendors, columnFilters),
    [vendors, columnFilters]
  )

  const sortedVendors = React.useMemo(
    () => sortVendorListRows(columnFilteredVendors, sortKey, sortDir, typeLabel),
    [columnFilteredVendors, sortKey, sortDir, typeLabel]
  )

  const handleClearSearch = () => {
    setSearchTerm("")
    setColumnFilters({})
    onSearch()
  }

  const handleSort = (key: VendorListSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir("asc")
  }

  const setColumnFilter = (key: VendorListSortKey, next: Set<string> | null) => {
    setColumnFilters((prev) => ({ ...prev, [key]: next }))
  }

  const filterProps = {
    searchPlaceholder: t("vendorColFilterSearch"),
    selectAllLabel: t("vendorColFilterSelectAll"),
    clearLabel: t("vendorColFilterClear"),
    sortAscLabel: t("vendorColSortAsc"),
    sortDescLabel: t("vendorColSortDesc"),
    filterLabel: t("vendorColFilter"),
  }

  const filterHeader = (key: VendorListSortKey, label: string) => (
    <div className="flex min-w-0 items-center gap-0.5">
      {sortHeader(key, label)}
      <VendorColumnFilter
        options={uniqueVendorColumnOptions(vendorColumnOptionRows(vendors, columnFilters, key), key, typeLabel)}
        selected={columnFilters[key] ?? null}
        onChange={(next) => setColumnFilter(key, next)}
        onSortAsc={() => {
          setSortKey(key)
          setSortDir("asc")
        }}
        onSortDesc={() => {
          setSortKey(key)
          setSortDir("desc")
        }}
        {...filterProps}
      />
    </div>
  )

  const sortIcon = (key: VendorListSortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3 w-3 shrink-0 opacity-45" aria-hidden />
    }
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
    ) : (
      <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
    )
  }

  const sortHeader = (key: VendorListSortKey, label: string) => (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 rounded text-[11px] font-bold text-muted-foreground hover:text-foreground"
      onClick={() => handleSort(key)}
    >
      <span className="truncate">{label}</span>
      {sortIcon(key)}
    </button>
  )

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <ListFilter className="h-[18px] w-[18px] text-warning" />
        </div>
        <h3 className="text-sm font-bold text-card-foreground">{t("vendorList")}</h3>
        <span className="ml-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {hasSearched
            ? columnFilteredVendors.length !== vendors.length
              ? `${columnFilteredVendors.length} / ${vendors.length} ${t("vendorCount")}`
              : `${vendors.length} ${t("vendorCount")}`
            : "-"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-6 py-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("vendorSearchPh")}
            className="h-9 pl-9 pr-9 text-xs"
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
          {searchTerm ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-destructive"
              onClick={handleClearSearch}
              title={t("vendorBtnClose")}
              aria-label={t("vendorBtnClose")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as VendorTypeFilter)}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder={t("vendorTypeAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("vendorTypeAll")}</SelectItem>
            <SelectItem value="purchase">{t("vendorTypePurchase")}</SelectItem>
            <SelectItem value="sales">{t("vendorTypeSales")}</SelectItem>
            <SelectItem value="related">{tOr(t, "vendorTypeRelated", "관련당사자")}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={onSearch}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("vendorBtnSearch")}
        </Button>
      </div>

      <div className={cn(ADMIN_TABLE_SCROLL_VIEWPORT_CN, "max-h-[calc(100vh-14rem)]")}>
        <table className="w-full text-left text-sm table-fixed">
          <colgroup>
            <col className="w-[96px]" />
            <col className="w-[112px]" />
            <col />
            <col className="w-[140px]" />
            <col className="w-[120px]" />
            <col className="w-[88px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-3" aria-sort={sortKey === "code" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                {filterHeader("code", t("vendorColCode"))}
              </th>
              <th className="px-4 py-3" aria-sort={sortKey === "type" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                {filterHeader("type", t("vendorColType"))}
              </th>
              <th className="px-4 py-3" aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
                {filterHeader("name", t("vendorColName"))}
              </th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground">
                {t("expensePayeeBankName") || "Bank"}
              </th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground">{t("vendorColLinkedStores")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground text-center">{t("vendorDirectSettlement")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground text-center">{t("vendorColAction")}</th>
            </tr>
          </thead>
          <tbody>
            {!hasSearched ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <LogisticsEmptyState
                    icon={Search}
                    title={t("vendorSearchHint")}
                    className="border-0 bg-transparent py-10"
                  />
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <div className="py-10 text-center text-sm text-muted-foreground">{t("loading")}</div>
                </td>
              </tr>
            ) : columnFilteredVendors.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-0">
                  <LogisticsEmptyState
                    icon={ListFilter}
                    title={t("vendorNoResults")}
                    className="border-0 bg-transparent py-10"
                  />
                </td>
              </tr>
            ) : (
              sortedVendors.map((vendor, idx) => (
                <tr
                  key={vendor.code}
                  className={cn(
                    "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                    idx % 2 === 1 && "bg-muted/5"
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
                      {vendor.code}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                        vendor.type === "purchase" && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                        vendor.type === "sales" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        vendor.type === "both" && "bg-violet-500/15 text-violet-700 dark:text-violet-400",
                        vendor.type === "related" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      )}
                    >
                      {typeLabel(vendor.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-sm font-medium text-foreground whitespace-nowrap"
                      title={vendorListDisplayName(vendor)}
                    >
                      {vendorListDisplayName(vendor)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {vendor.bank_name || vendor.bank_account_no ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium" title={vendor.bank_name || ""}>
                          {vendor.bank_name || "—"}
                        </p>
                        <p
                          className="truncate text-[11px] tabular-nums text-muted-foreground"
                          title={vendor.bank_account_no || ""}
                        >
                          {vendor.bank_account_no || "—"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const links = linkedStoresByVendor[vendor.code] || []
                      if (links.length === 0) {
                        return <span className="text-[11px] text-muted-foreground">{t("vendorLinkedStoresNone")}</span>
                      }
                      return (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {links.slice(0, 3).map((l) => (
                            <span
                              key={`${vendor.code}-${l.storeCode}`}
                              className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
                              title={
                                l.via === "vendor_code"
                                  ? t("vendorLinkedViaProfile")
                                  : l.via === "sales_outlet"
                                    ? t("vendorLinkedViaSalesOutlet")
                                    : t("vendorLinkedViaGps")
                              }
                            >
                              {l.storeCode}
                            </span>
                          ))}
                          {links.length > 3 ? (
                            <span className="text-[10px] text-muted-foreground">+{links.length - 3}</span>
                          ) : null}
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {vendor.direct_settlement ? (
                      <span className="inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                        {t("vendorDirectSettlement")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                        onClick={() => onEdit(vendor)}
                        title={t("vendorBtnEdit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onDelete(vendor)}
                        title={t("vendorBtnDelete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/10 px-6 py-3">
        <span className="text-[11px] text-muted-foreground">
          {t("vendorTotal")}{" "}
          <span className="font-bold text-foreground">
            {hasSearched
              ? columnFilteredVendors.length !== vendors.length
                ? `${columnFilteredVendors.length} / ${vendors.length}`
                : vendors.length
              : 0}
          </span>{" "}
          {t("vendorTotalCount")}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 min-w-7 bg-primary text-primary-foreground border-primary text-[11px] font-bold hover:bg-primary/90 hover:text-primary-foreground">
            1
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
