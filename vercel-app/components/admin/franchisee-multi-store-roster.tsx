"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { RefreshCw } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { appAlert } from "@/lib/app-message"
import { formatEmployeeDisplayName } from "@/lib/employee-display-name"
import { labelForStore } from "@/lib/store-list-keys"
import {
  getFranchiseeMultiStoreRoster,
  saveFranchiseeMultiStoreRoster,
  type FranchiseeMultiStoreRosterItem,
} from "@/lib/api-client"

type Props = {
  enabled: boolean
  maxStores: number
  canEdit: boolean
  allStores: string[]
  storeLabels: Record<string, string>
  /** 전역 설정 저장 후 목록 재조회 */
  reloadKey?: number
}

export function FranchiseeMultiStoreRoster({
  enabled,
  maxStores,
  canEdit,
  allStores,
  storeLabels,
  reloadKey = 0,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [roster, setRoster] = useState<FranchiseeMultiStoreRosterItem[]>([])
  const [draft, setDraft] = useState<Record<number, string[]>>({})
  const [apiStores, setApiStores] = useState<string[]>([])

  const storeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of [...allStores, ...apiStores]) {
      const x = String(s || "").trim()
      if (x) set.add(x)
    }
    for (const r of roster) {
      if (r.store) set.add(r.store)
      for (const e of r.extraStores) {
        if (e) set.add(e)
      }
      for (const e of draft[r.row] || []) {
        if (e) set.add(e)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [allStores, apiStores, roster, draft])

  const loadRoster = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getFranchiseeMultiStoreRoster()
      if (!res.success) {
        await appAlert(res.message || t("msg_load_fail"))
        setRoster([])
        setDraft({})
        return
      }
      const list = res.roster || []
      setRoster(list)
      setApiStores(Array.isArray(res.stores) ? res.stores.filter(Boolean) : [])
      const next: Record<number, string[]> = {}
      for (const r of list) {
        next[r.row] = [...(r.extraStores || [])]
      }
      setDraft(next)
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (canEdit && enabled) void loadRoster()
    if (!enabled) {
      setRoster([])
      setDraft({})
      setApiStores([])
    }
  }, [canEdit, enabled, loadRoster, reloadKey])

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((r) => {
      const hay = [r.store, r.name, r.nick, r.role].join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [roster, search])

  const toggleExtra = (rowId: number, primaryStore: string, storeName: string) => {
    const st = String(storeName || "").trim()
    const primary = String(primaryStore || "").trim()
    if (!st || st === primary) return
    setDraft((prev) => {
      const cur = new Set(prev[rowId] || [])
      const maxExtra = Math.max(0, maxStores - 1)
      if (cur.has(st)) {
        cur.delete(st)
      } else {
        if (cur.size >= maxExtra) return prev
        cur.add(st)
      }
      return { ...prev, [rowId]: [...cur] }
    })
  }

  const handleSaveRoster = async () => {
    if (!canEdit || !enabled) return
    if (roster.length === 0) {
      await appAlert(t("settings_franchisee_multi_roster_empty"))
      return
    }
    setSaving(true)
    try {
      const assignments = roster.map((r) => ({
        employeeId: r.row,
        extraStores: draft[r.row] || [],
      }))
      const res = await saveFranchiseeMultiStoreRoster(assignments)
      if (!res.success) {
        await appAlert(res.message || t("msg_save_fail"))
        return
      }
      await appAlert(t("settings_saved") || "저장되었습니다.")
      const list = res.roster || []
      setRoster(list)
      const next: Record<number, string[]> = {}
      for (const r of list) {
        next[r.row] = [...(r.extraStores || [])]
      }
      setDraft(next)
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) return null

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">{t("settings_franchisee_multi_roster_title")}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t("settings_franchisee_multi_roster_desc")}</p>
      </div>

      {!enabled ? (
        <p className="text-xs text-muted-foreground">{t("settings_franchisee_multi_roster_disabled_hint")}</p>
      ) : loading ? (
        <p className="py-4 text-center text-muted-foreground text-xs">{t("loading")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-9 max-w-xs text-xs"
              placeholder={t("settings_franchisee_multi_roster_search_ph")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void loadRoster()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
              {t("settings_franchisee_multi_roster_reload")}
            </Button>
          </div>

          {filteredRoster.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t("settings_franchisee_multi_roster_empty")}</p>
          ) : (
            <div className="space-y-3 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
              {filteredRoster.map((r) => {
                const primary = String(r.store || "").trim()
                const extras = draft[r.row] || []
                const display = formatEmployeeDisplayName(r.nick || r.name, undefined)
                const maxExtra = Math.max(0, maxStores - 1)
                return (
                  <div key={r.row} className="rounded-md border border-border/70 bg-muted/15 p-3 space-y-2">
                    <div className="text-xs">
                      <span className="font-semibold">{display || r.name}</span>
                      <span className="text-muted-foreground ml-2">
                        {t("settings_franchisee_multi_roster_primary")}: {labelForStore(storeLabels, primary)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-2">
                      {storeOptions
                        .filter((st) => st && st !== primary)
                        .map((st) => {
                          const checked = extras.includes(st)
                          const atCap = !checked && extras.length >= maxExtra
                          return (
                            <label
                              key={`${r.row}-${st}`}
                              className={`flex items-center gap-1.5 text-xs ${atCap ? "opacity-50" : "cursor-pointer"}`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={atCap}
                                onCheckedChange={() => toggleExtra(r.row, primary, st)}
                              />
                              <span>{labelForStore(storeLabels, st)}</span>
                            </label>
                          )
                        })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <Button
            type="button"
            className="h-9"
            disabled={saving || roster.length === 0}
            onClick={() => void handleSaveRoster()}
          >
            {saving ? t("loading") : t("settings_franchisee_multi_roster_save")}
          </Button>
        </>
      )}
    </div>
  )
}
