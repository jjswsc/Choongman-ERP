"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { appAlert } from "@/lib/app-message"
import { formatEmployeeDisplayName } from "@/lib/employee-display-name"
import { labelForStore } from "@/lib/store-list-keys"
import { useStoreList } from "@/lib/use-store-list"
import {
  getFranchiseeMultiStoreRoster,
  saveFranchiseeMultiStoreRoster,
  type FranchiseeMultiStoreRosterItem,
} from "@/lib/api-client"

const ALL_FRANCHISEES = "__all__"

type Props = {
  /** 가맹점주 탭이 열려 있을 때만 목록 조회 */
  active: boolean
  enabled: boolean
  maxStores: number
  canEdit: boolean
  /** 전역 설정 저장 후 목록 재조회 */
  reloadKey?: number
  /** 매장 지정 저장 성공 시(전역 설정 동기화 포함) */
  onRosterSaved?: () => void
}

function rosterSearchHaystack(
  r: FranchiseeMultiStoreRosterItem,
  storeLabels: Record<string, string>
): string {
  const primary = String(r.store || "").trim()
  return [
    primary,
    labelForStore(storeLabels, primary),
    r.name,
    r.nick,
    r.role,
    ...(r.extraStores || []).flatMap((s) => [s, labelForStore(storeLabels, s)]),
  ]
    .join(" ")
    .toLowerCase()
}

function displayNameForRoster(r: FranchiseeMultiStoreRosterItem): string {
  const nick = String(r.nick || "").trim()
  const legal = String(r.name || "").trim()
  if (nick && legal && nick !== legal) return `${nick} (${legal})`
  return formatEmployeeDisplayName(nick || legal, undefined) || legal || nick || `#${r.row}`
}

export function FranchiseeMultiStoreRoster({
  active,
  enabled,
  maxStores,
  canEdit,
  reloadKey = 0,
  onRosterSaved,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeListFromApi, storeLabels, loading: storesLoading } = useStoreList()
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [pickId, setPickId] = useState<string>(ALL_FRANCHISEES)
  const [roster, setRoster] = useState<FranchiseeMultiStoreRosterItem[]>([])
  const [draft, setDraft] = useState<Record<number, string[]>>({})
  const [apiStores, setApiStores] = useState<string[]>([])

  const storeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const s of [...storeListFromApi, ...apiStores]) {
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
  }, [storeListFromApi, apiStores, roster, draft])

  const loadRoster = useCallback(async () => {
    setLoading(true)
    setLoadError("")
    try {
      const res = await getFranchiseeMultiStoreRoster()
      if (!res.success) {
        const msg = res.message || t("msg_load_fail")
        setLoadError(msg)
        setRoster([])
        setDraft({})
        setApiStores([])
        await appAlert(msg)
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
      setPickId((prev) => {
        if (prev === ALL_FRANCHISEES) return prev
        const id = Number(prev)
        return list.some((r) => r.row === id) ? prev : ALL_FRANCHISEES
      })
    } catch (e) {
      const msg = t("msg_error_prefix") + (e instanceof Error ? e.message : String(e))
      setLoadError(msg)
      await appAlert(msg)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!active || !canEdit) return
    void loadRoster()
  }, [active, canEdit, loadRoster, reloadKey])

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = roster
    if (q) {
      list = list.filter((r) => rosterSearchHaystack(r, storeLabels).includes(q))
    }
    if (pickId !== ALL_FRANCHISEES) {
      const id = Number(pickId)
      list = list.filter((r) => r.row === id)
    }
    return list
  }, [roster, search, pickId, storeLabels])

  const pickOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((r) => rosterSearchHaystack(r, storeLabels).includes(q))
  }, [roster, search, storeLabels])

  const toggleExtra = (rowId: number, primaryStore: string, storeName: string) => {
    if (!enabled) return
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
    if (!canEdit || !enabled) {
      await appAlert(t("settings_franchisee_multi_roster_disabled_hint"))
      return
    }
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
      const res = await saveFranchiseeMultiStoreRoster(assignments, {
        syncSettings: { enabled: true, maxStores },
      })
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
      onRosterSaved?.()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) return null

  const listEmpty = roster.length === 0 && !loading
  const searchNoMatch = roster.length > 0 && filteredRoster.length === 0

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">{t("settings_franchisee_multi_roster_title")}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t("settings_franchisee_multi_roster_desc")}</p>
      </div>

      {!enabled ? (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 rounded-md px-3 py-2">
          {t("settings_franchisee_multi_roster_disabled_hint")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-semibold block mb-1">{t("settings_franchisee_multi_roster_pick")}</label>
          <Select value={pickId} onValueChange={setPickId} disabled={loading || listEmpty}>
            <SelectTrigger className="h-9 text-xs w-full max-w-md">
              <SelectValue placeholder={t("settings_franchisee_multi_roster_pick_ph")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FRANCHISEES}>{t("settings_franchisee_multi_roster_pick_all")}</SelectItem>
              {pickOptions.map((r) => (
                <SelectItem key={r.row} value={String(r.row)}>
                  {displayNameForRoster(r)} — {labelForStore(storeLabels, r.store)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="text-xs font-semibold block mb-1">{t("settings_franchisee_multi_roster_search_ph")}</label>
          <Input
            className="h-9 text-xs w-full max-w-xs"
            placeholder={t("settings_franchisee_multi_roster_search_ph")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={() => void loadRoster()}
          disabled={loading}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
          {t("settings_franchisee_multi_roster_reload")}
        </Button>
      </div>

      {!loading && roster.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("settings_franchisee_multi_roster_count").replace("{n}", String(roster.length))}
          {search.trim() ? ` · ${t("settings_franchisee_multi_roster_filter_count").replace("{n}", String(filteredRoster.length))}` : ""}
        </p>
      ) : null}

      {loading ? (
        <p className="py-4 text-center text-muted-foreground text-xs">{t("loading")}</p>
      ) : loadError ? (
        <p className="text-xs text-destructive py-2">{loadError}</p>
      ) : listEmpty ? (
        <p className="text-xs text-muted-foreground py-2">{t("settings_franchisee_multi_roster_empty")}</p>
      ) : searchNoMatch ? (
        <p className="text-xs text-muted-foreground py-2">{t("settings_franchisee_multi_roster_no_search")}</p>
      ) : storesLoading && storeOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{t("loading")}</p>
      ) : (
        <div className="space-y-3 max-h-[min(55vh,480px)] overflow-y-auto pr-1">
          {filteredRoster.map((r) => {
            const primary = String(r.store || "").trim()
            const extras = draft[r.row] || []
            const display = displayNameForRoster(r)
            const maxExtra = Math.max(0, maxStores - 1)
            const extraStores = storeOptions.filter((st) => st && st !== primary)
            return (
              <div key={r.row} className="rounded-md border border-border/70 bg-muted/15 p-3 space-y-2">
                <div className="text-xs">
                  <span className="font-semibold">{display}</span>
                  <span className="text-muted-foreground ml-2">
                    {t("settings_franchisee_multi_roster_primary")}: {labelForStore(storeLabels, primary)}
                  </span>
                  {maxExtra > 0 ? (
                    <span className="text-muted-foreground ml-2">
                      ({extras.length}/{maxExtra})
                    </span>
                  ) : null}
                </div>
                {extraStores.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("settings_franchisee_multi_roster_no_stores")}</p>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-2">
                    {extraStores.map((st) => {
                      const checked = extras.includes(st)
                      const atCap = !checked && extras.length >= maxExtra
                      return (
                        <label
                          key={`${r.row}-${st}`}
                          className={`flex items-center gap-1.5 text-xs ${atCap ? "opacity-50" : enabled ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!enabled || atCap}
                            onCheckedChange={() => toggleExtra(r.row, primary, st)}
                          />
                          <span>{labelForStore(storeLabels, st)}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button
        type="button"
        className="h-9"
        disabled={saving || roster.length === 0 || !enabled}
        onClick={() => void handleSaveRoster()}
      >
        {saving ? t("loading") : t("settings_franchisee_multi_roster_save")}
      </Button>
    </div>
  )
}
