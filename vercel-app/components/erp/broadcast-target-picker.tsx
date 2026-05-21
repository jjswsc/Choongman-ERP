"use client"

import * as React from "react"
import { Store, Briefcase, Shield, Users } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getNoticeOptions, useStoreList } from "@/lib/api-client"
import { isOfficeStore } from "@/lib/permissions"
import type { BroadcastTargetSelectionState } from "@/lib/broadcast-target-selection"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type BroadcastTargetOptionCounts = {
  storeOptionCount: number
  positionOptionCount: number
  permissionOptionCount: number
}

export type BroadcastTargetPickerProps = {
  value: BroadcastTargetSelectionState
  onChange: (next: BroadcastTargetSelectionState) => void
  /** 매장·직무·권한 옵션 개수(「전체」 제외) — 저장 payload 산출용 */
  onOptionCountsChange?: (counts: BroadcastTargetOptionCounts) => void
  /** 직원 목록 영역 높이(px) */
  employeeListHeight?: number
  className?: string
}

export function BroadcastTargetPicker({
  value,
  onChange,
  onOptionCountsChange,
  employeeListHeight = 100,
  className,
}: BroadcastTargetPickerProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { staffByStore } = useStoreList()

  const [stores, setStores] = React.useState<string[]>([])
  const [positions, setPositions] = React.useState<string[]>([])
  const [permissionGroups, setPermissionGroups] = React.useState<string[]>([])

  const allLabel = t("noticeFilterAll")
  const { selectedStores, selectedPositions, selectedPermissionGroups, selectedRecipients } = value

  React.useEffect(() => {
    if (!auth?.store) return
    const isOffice =
      auth.role === "director" ||
      auth.role === "officer" ||
      auth.role === "accounting" ||
      (auth.role || "").toLowerCase().includes("hr")
    getNoticeOptions().then((r) => {
      const storeList = isOffice ? (r.stores || []) : [auth.store!]
      setStores([allLabel, ...storeList])
      setPositions([allLabel, ...(r.roles || [])])
      setPermissionGroups([allLabel, ...(r.permissionGroups || [])])
    })
  }, [auth?.store, auth?.role, allLabel])

  const patch = (partial: Partial<BroadcastTargetSelectionState>) => {
    onChange({ ...value, ...partial })
  }

  const storeNamesOnly = React.useMemo(
    () => stores.filter((s) => s !== allLabel),
    [stores, allLabel]
  )

  React.useEffect(() => {
    onOptionCountsChange?.({
      storeOptionCount: Math.max(0, stores.length - 1),
      positionOptionCount: Math.max(0, positions.length - 1),
      permissionOptionCount: Math.max(0, permissionGroups.length - 1),
    })
  }, [stores.length, positions.length, permissionGroups.length, onOptionCountsChange])

  const toggleStore = (store: string) => {
    if (store === allLabel) {
      patch({
        selectedStores:
          selectedStores.length === stores.length - 1
            ? []
            : stores.filter((s) => s !== allLabel),
      })
      return
    }
    patch({
      selectedStores: selectedStores.includes(store)
        ? selectedStores.filter((s) => s !== store)
        : [...selectedStores, store],
    })
  }

  const togglePosition = (position: string) => {
    if (position === allLabel) {
      patch({
        selectedPositions:
          selectedPositions.length === positions.length - 1
            ? []
            : positions.filter((p) => p !== allLabel),
      })
      return
    }
    patch({
      selectedPositions: selectedPositions.includes(position)
        ? selectedPositions.filter((p) => p !== position)
        : [...selectedPositions, position],
    })
  }

  const togglePermissionGroup = (perm: string) => {
    if (perm === allLabel) {
      patch({
        selectedPermissionGroups:
          selectedPermissionGroups.length === permissionGroups.length - 1
            ? []
            : permissionGroups.filter((p) => p !== allLabel),
      })
      return
    }
    patch({
      selectedPermissionGroups: selectedPermissionGroups.includes(perm)
        ? selectedPermissionGroups.filter((p) => p !== perm)
        : [...selectedPermissionGroups, perm],
    })
  }

  const toggleRecipient = (store: string, name: string) => {
    const key = `${store}|${name}`
    patch({
      selectedRecipients: selectedRecipients.includes(key)
        ? selectedRecipients.filter((x) => x !== key)
        : [...selectedRecipients, key],
    })
  }

  const applyPresetAll = () => {
    patch({
      selectedStores: [],
      selectedPositions: [],
      selectedPermissionGroups: [],
      selectedRecipients: [],
    })
  }

  const applyPresetOffice = () => {
    const office = storeNamesOnly.filter((s) => isOfficeStore(s))
    patch({
      selectedStores: office.length > 0 ? office : [],
      selectedRecipients: [],
    })
  }

  const applyPresetFranchise = () => {
    const franchise = storeNamesOnly.filter((s) => !isOfficeStore(s))
    patch({
      selectedStores: franchise.length > 0 ? franchise : [],
      selectedRecipients: [],
    })
  }

  const allStoresForStaff =
    selectedStores.length === 0 || selectedStores.length === stores.length - 1
  const storeNamesForStaff = allStoresForStaff ? storeNamesOnly : selectedStores
  const allPositionsForStaff =
    selectedPositions.length === 0 || selectedPositions.length === positions.length - 1
  const positionsToMatch = allPositionsForStaff
    ? null
    : new Set(
        selectedPositions
          .filter((p) => p !== allLabel)
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      )
  const allPermissionGroupsForStaff =
    selectedPermissionGroups.length === 0 ||
    selectedPermissionGroups.length === permissionGroups.length - 1
  const permissionGroupsToMatch = allPermissionGroupsForStaff
    ? null
    : new Set(
        selectedPermissionGroups
          .filter((p) => p !== allLabel)
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      )

  const employeeList: { store: string; name: string; nick: string }[] = React.useMemo(() => {
    const list: { store: string; name: string; nick: string }[] = []
    for (const store of storeNamesForStaff) {
      const staff = staffByStore[store] || []
      for (const s of staff) {
        if (!s.name) continue
        if (positionsToMatch && positionsToMatch.size > 0) {
          const empJob = String(s.job || "").trim().toLowerCase()
          if (!empJob || !positionsToMatch.has(empJob)) continue
        }
        if (permissionGroupsToMatch && permissionGroupsToMatch.size > 0) {
          const empRole = String(s.role || "").trim().toLowerCase()
          if (!empRole || !permissionGroupsToMatch.has(empRole)) continue
        }
        list.push({ store, name: s.name, nick: s.nick || s.name })
      }
    }
    return list.sort((a, b) => (a.nick || "").localeCompare(b.nick || ""))
  }, [storeNamesForStaff, staffByStore, positionsToMatch, permissionGroupsToMatch])

  if (!auth?.store) return null

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground">{t("hrPolicyTargetPresetLabel")}</span>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={applyPresetAll}>
          {t("hrPolicyTargetPresetAll")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={applyPresetOffice}>
          {t("hrPolicyTargetPresetOffice")}
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={applyPresetFranchise}>
          {t("hrPolicyTargetPresetStores")}
        </Button>
        <span className="text-[10px] text-muted-foreground">{t("hrPolicyTargetPresetHint")}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <Store className="h-3.5 w-3.5" />
            {t("store")}
          </label>
          <ScrollArea className="h-[140px] rounded-md border p-1">
            <div className="flex flex-col gap-0.5 pr-2">
              {stores.map((store) => {
                const isAll = store === allLabel
                const checked = isAll
                  ? selectedStores.length === stores.length - 1
                  : selectedStores.includes(store)
                return (
                  <label
                    key={store}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                      checked ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStore(store)}
                      className="h-3.5 w-3.5"
                    />
                    {store}
                  </label>
                )
              })}
            </div>
          </ScrollArea>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <Shield className="h-3.5 w-3.5" />
            {t("adminTargetPermissionGroups")}
          </label>
          <ScrollArea className="h-[140px] rounded-md border p-1">
            <div className="flex flex-col gap-0.5 pr-2">
              {permissionGroups.map((perm) => {
                const isAll = perm === allLabel
                const checked = isAll
                  ? selectedPermissionGroups.length === permissionGroups.length - 1
                  : selectedPermissionGroups.includes(perm)
                return (
                  <label
                    key={perm}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                      checked ? "bg-amber-500/10" : "hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePermissionGroup(perm)}
                      className="h-3.5 w-3.5"
                    />
                    {perm}
                  </label>
                )
              })}
            </div>
          </ScrollArea>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <Briefcase className="h-3.5 w-3.5" />
            {t("noticeTargetDept")}
          </label>
          <ScrollArea className="h-[140px] rounded-md border p-1">
            <div className="flex flex-col gap-0.5 pr-2">
              {positions.map((pos) => {
                const isAll = pos === allLabel
                const checked = isAll
                  ? selectedPositions.length === positions.length - 1
                  : selectedPositions.includes(pos)
                return (
                  <label
                    key={pos}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                      checked ? "bg-emerald-500/10" : "hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => togglePosition(pos)}
                      className="h-3.5 w-3.5"
                    />
                    {pos}
                  </label>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("adminTargetIndividuals")}
          <span className="text-muted-foreground">
            {selectedRecipients.length}
            {t("adminRecipientsCountSuffix")}
          </span>
        </label>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{t("hrPolicyTargetIndividualsHint")}</p>
        <ScrollArea
          className="mt-1.5 rounded-md border p-2"
          style={{ height: employeeListHeight }}
        >
          <div className="flex flex-wrap gap-1.5 pr-2">
            {employeeList.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              employeeList.map((emp) => {
                const key = `${emp.store}|${emp.name}`
                const checked = selectedRecipients.includes(key)
                return (
                  <label
                    key={key}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                      checked ? "bg-amber-500/15" : "opacity-80"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleRecipient(emp.store, emp.name)}
                      className="h-3 w-3"
                    />
                    {emp.nick}
                  </label>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
