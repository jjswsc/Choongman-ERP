"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import type { AccountSubjectItem } from "@/lib/api-client"
import {
  decodeBankAdvanceSelectValue,
  encodeBankAdvanceSelectValue,
  resolveBankAdvanceTargetLabel,
} from "@/lib/bank-advance-display"
import { encodeCardPayeeCode } from "@/lib/prepayment-accrual-categories"

export type BankAdvanceTargetCellProps = {
  storeName?: string | null
  vendorCode?: string | null
  prepaymentSubject?: AccountSubjectItem | null
  stores: string[]
  vendors: { code: string; name: string }[]
  cardAccounts?: { id: number; name: string }[]
  storeSearch: string
  onStoreSearchChange: (value: string) => void
  vendorSearch: string
  onVendorSearchChange: (value: string) => void
  onVendorDropdownOpen?: () => void
  onChange: (next: { storeName: string; vendorCode: string }) => void
  asDisplayName?: (item: AccountSubjectItem) => string
  t: (key: string) => string | undefined
  tt: (key: string, fallback: string) => string
}

export function BankAdvanceTargetCell({
  storeName,
  vendorCode,
  prepaymentSubject,
  stores,
  vendors,
  cardAccounts = [],
  storeSearch,
  onStoreSearchChange,
  vendorSearch,
  onVendorSearchChange,
  onVendorDropdownOpen,
  onChange,
  asDisplayName,
  t,
  tt,
}: BankAdvanceTargetCellProps) {
  const prepayLabel = prepaymentSubject
    ? `${prepaymentSubject.code} ${asDisplayName ? asDisplayName(prepaymentSubject) : prepaymentSubject.name}`
    : tt("bankAdvancePrepaymentAccount", "1160 선급금")

  const targetLabel = resolveBankAdvanceTargetLabel({
    storeName,
    vendorCode,
    vendors,
    cardAccounts,
    storeLabel: t("store") || "매장",
    vendorLabel: t("vendor") || "거래처",
    cardLabel: tt("bankAdvanceTargetCardGroup", "카드"),
  })

  const selectValue = encodeBankAdvanceSelectValue({ storeName, vendorCode })
  const storeNeedle = storeSearch.trim().toLowerCase()
  const vendorNeedle = vendorSearch.trim().toLowerCase()
  const filteredStores = stores.filter((s) => !storeNeedle || (s || "").toLowerCase().includes(storeNeedle))
  const filteredVendors = vendors.filter(
    (v) => !vendorNeedle || (v.name || v.code || "").toLowerCase().includes(vendorNeedle)
  )
  const filteredCards = cardAccounts.filter(
    (c) => !vendorNeedle || (c.name || "").toLowerCase().includes(vendorNeedle)
  )

  return (
    <div className="space-y-1 min-w-[140px] max-w-[180px]">
      <div className="text-[10px] leading-tight text-muted-foreground truncate" title={prepayLabel}>
        {prepayLabel}
      </div>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          const decoded = decodeBankAdvanceSelectValue(v)
          onChange({
            storeName: String(decoded.storeName || "").trim(),
            vendorCode: String(decoded.vendorCode || "").trim(),
          })
        }}
        onOpenChange={(open) => {
          if (!open) {
            onStoreSearchChange("")
            onVendorSearchChange("")
            return
          }
          onVendorDropdownOpen?.()
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={tt("bankAdvanceTargetPlaceholder", "전도 대상")}>
            {targetLabel || tt("bankAdvanceTargetPlaceholder", "전도 대상")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[min(24rem,70vh)]">
          <div className="p-1.5 border-b space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <Input
              placeholder={tt("bankAdvanceTargetSearchStore", "매장 검색")}
              value={storeSearch}
              onChange={(e) => onStoreSearchChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-7 text-xs"
            />
            <Input
              placeholder={tt("bankAdvanceTargetSearchVendor", "거래처·카드 검색")}
              value={vendorSearch}
              onChange={(e) => onVendorSearchChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              className="h-7 text-xs"
            />
          </div>
          <SelectItem value="__none__">—</SelectItem>
          {filteredStores.length > 0 ? (
            <SelectGroup>
              <SelectLabel>{tt("bankAdvanceTargetStoreGroup", "매장")}</SelectLabel>
              {filteredStores.map((s) => (
                <SelectItem key={`store:${s}`} value={`store:${s}`}>
                  {s}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          {filteredVendors.length > 0 ? (
            <SelectGroup>
              <SelectLabel>{tt("bankAdvanceTargetVendorGroup", "거래처")}</SelectLabel>
              {filteredVendors.map((v) => (
                <SelectItem key={`vendor:${v.code}`} value={`vendor:${v.code}`}>
                  {v.name || v.code}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
          {filteredCards.length > 0 ? (
            <SelectGroup>
              <SelectLabel>{tt("bankAdvanceTargetCardGroup", "카드")}</SelectLabel>
              {filteredCards.map((c) => (
                <SelectItem key={`vendor:${encodeCardPayeeCode(c.id)}`} value={`vendor:${encodeCardPayeeCode(c.id)}`}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}
