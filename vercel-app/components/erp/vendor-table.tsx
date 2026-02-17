"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ListFilter,
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
import { cn } from "@/lib/utils"

export interface Vendor {
  code: string
  name: string
  gps_name?: string
  contact: string
  phone: string
  email: string
  address: string
  type: "purchase" | "sales" | "both"
  memo: string
}

export type VendorTypeFilter = "all" | "purchase" | "sales"

export interface VendorTableProps {
  vendors: Vendor[]
  hasSearched: boolean
  searchTerm: string
  setSearchTerm: (v: string) => void
  typeFilter: VendorTypeFilter
  setTypeFilter: (v: VendorTypeFilter) => void
  onSearch: () => void
  onEdit: (vendor: Vendor) => void
  onDelete: (vendor: Vendor) => void
}

export function VendorTable({
  vendors,
  hasSearched,
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  onSearch,
  onEdit,
  onDelete,
}: VendorTableProps) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <ListFilter className="h-[18px] w-[18px] text-warning" />
        </div>
        <h3 className="text-sm font-bold text-card-foreground">{t("vendorList")}</h3>
        <span className="ml-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {hasSearched ? `${vendors.length} ${t("vendorCount")}` : "-"}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-b bg-muted/20 px-6 py-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("vendorSearchPh")}
            className="h-9 pl-9 text-xs"
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as VendorTypeFilter)}>
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder={t("vendorTypeAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("vendorTypeAll")}</SelectItem>
            <SelectItem value="purchase">{t("vendorTypePurchase")}</SelectItem>
            <SelectItem value="sales">{t("vendorTypeSales")}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={onSearch}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("vendorBtnSearch")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20">{t("vendorColCode")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20">{t("vendorColType")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground min-w-[140px]">{t("vendorColName")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28">{t("vendorColPhone")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("vendorColAction")}</th>
            </tr>
          </thead>
          <tbody>
            {!hasSearched ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("vendorSearchHint")}
                </td>
              </tr>
            ) : vendors.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("vendorNoResults")}
                </td>
              </tr>
            ) : (
              vendors.map((vendor, idx) => (
                <tr
                  key={vendor.code}
                  className={cn(
                    "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                    idx % 2 === 1 && "bg-muted/5"
                  )}
                >
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
                      {vendor.code}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                        vendor.type === "purchase" && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                        vendor.type === "sales" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        vendor.type === "both" && "bg-violet-500/15 text-violet-700 dark:text-violet-400"
                      )}
                    >
                      {vendor.type === "purchase"
                        ? t("vendorTypePurchase")
                        : vendor.type === "sales"
                          ? t("vendorTypeSales")
                          : t("vendorTypeBoth")}
                    </span>
                  </td>
                  <td className="px-5 py-3 min-w-[140px]">
                    <span className="text-sm font-medium text-foreground">
                      {(vendor.type === "sales" || vendor.type === "both") && vendor.gps_name?.trim()
                        ? vendor.gps_name
                        : vendor.name}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-muted-foreground">{vendor.phone || "-"}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-semibold text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                        onClick={() => onEdit(vendor)}
                      >
                        <Pencil className="mr-1 h-2.5 w-2.5" />
                        {t("vendorBtnEdit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onDelete(vendor)}
                      >
                        <Trash2 className="mr-1 h-2.5 w-2.5" />
                        {t("vendorBtnDelete")}
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
          {t("vendorTotal")} <span className="font-bold text-foreground">{hasSearched ? vendors.length : 0}</span> {t("vendorTotalCount")}
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
