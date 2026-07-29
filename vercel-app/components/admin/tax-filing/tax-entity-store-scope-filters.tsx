"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type TaxEntityScopeOption = {
  value: string
  label: string
  stores?: string[]
}

export function composeTaxFilingScope(entityValue: string, storeValue: string): string {
  const store = String(storeValue || "").trim()
  const entity = String(entityValue || "").trim()
  if (store && store !== "All") return store
  if (entity && entity !== "All") return entity
  return "All"
}

export function parseTaxFilingScope(
  scope: string,
  entityOptions: TaxEntityScopeOption[]
): { entityValue: string; storeValue: string } {
  const raw = String(scope || "").trim()
  if (!raw || raw === "All" || raw === "*") return { entityValue: "All", storeValue: "All" }
  if (raw.startsWith("entity:")) return { entityValue: raw, storeValue: "All" }

  const owner = entityOptions.find((e) => (e.stores || []).some((s) => s === raw))
  return {
    entityValue: owner?.value || "All",
    storeValue: raw,
  }
}

type Props = {
  scopeValue: string
  onScopeChange: (next: string) => void
  entityOptions: TaxEntityScopeOption[]
  storeOptions: string[]
  storeOptionLabel: (code: string) => string
  t: (key: string) => string
  idPrefix?: string
}

export function TaxEntityStoreScopeFilters({
  scopeValue,
  onScopeChange,
  entityOptions,
  storeOptions,
  storeOptionLabel,
  t,
  idPrefix = "tax-scope",
}: Props) {
  const parsed = React.useMemo(
    () => parseTaxFilingScope(scopeValue, entityOptions),
    [scopeValue, entityOptions]
  )

  const storesForEntity = React.useMemo(() => {
    if (parsed.entityValue === "All") {
      return storeOptions.filter((s) => s !== "All")
    }
    const hit = entityOptions.find((e) => e.value === parsed.entityValue)
    const mapped = hit?.stores || []
    if (mapped.length) return mapped
    return storeOptions.filter((s) => s !== "All")
  }, [parsed.entityValue, entityOptions, storeOptions])

  const onEntityChange = (entityValue: string) => {
    const nextEntity = entityValue || "All"
    // 법인 바꾸면 매장은 전체로 리셋 (해당 법인 합산)
    onScopeChange(composeTaxFilingScope(nextEntity, "All"))
  }

  const onStoreChange = (storeValue: string) => {
    const nextStore = storeValue || "All"
    onScopeChange(composeTaxFilingScope(parsed.entityValue, nextStore))
  }

  const entitySelectValue = parsed.entityValue || "All"
  const storeSelectValue =
    parsed.storeValue !== "All" && storesForEntity.includes(parsed.storeValue)
      ? parsed.storeValue
      : "All"

  return (
    <>
      {entityOptions.length > 0 ? (
        <div className="shrink-0">
          <div className="text-xs text-muted-foreground mb-1">{t("accCompTaxEntity")}</div>
          <Select value={entitySelectValue} onValueChange={onEntityChange}>
            <SelectTrigger className="h-9 w-[min(100%,320px)] min-w-[180px]">
              <SelectValue>
                {entitySelectValue === "All"
                  ? t("accCompTaxEntityAll")
                  : entityOptions.find((e) => e.value === entitySelectValue)?.label || entitySelectValue}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-w-[min(100vw-2rem,420px)]">
              <SelectItem value="All">{t("accCompTaxEntityAll")}</SelectItem>
              {entityOptions.map((e) => (
                <SelectItem key={`${idPrefix}-ent-${e.value}`} value={e.value} className="whitespace-normal">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="shrink-0">
        <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
        <Select value={storeSelectValue} onValueChange={onStoreChange}>
          <SelectTrigger className="h-9 w-[min(100%,220px)] min-w-[160px]">
            <SelectValue>
              {storeSelectValue === "All" ? t("accCompStoreAll") : storeOptionLabel(storeSelectValue)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t("accCompStoreAll")}</SelectItem>
            {storesForEntity.map((s) => (
              <SelectItem key={`${idPrefix}-store-${s}`} value={s}>
                {storeOptionLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )
}
