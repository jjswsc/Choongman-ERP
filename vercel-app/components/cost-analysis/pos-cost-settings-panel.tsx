"use client"

import * as React from "react"
import { appAlert } from "@/lib/app-message"
import { Settings2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { updateCostSettings } from "@/lib/api-client"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import type { PosCostListSettings } from "@/lib/pos-cost-analysis-shared"

type Props = {
  settings: PosCostListSettings
  rows: PosMenuCostAnalysisRow[]
  canEdit: boolean
  onSaved: (next: PosCostListSettings) => void
}

export function PosCostSettingsPanel({ settings, rows, canEdit, onSaved }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [goodMax, setGoodMax] = React.useState(String(settings.costRatioGoodMax))
  const [cautionMax, setCautionMax] = React.useState(String(settings.costRatioCautionMax))
  const [targets, setTargets] = React.useState<Record<string, string>>({})

  const categories = React.useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      const cat = String(r.categoryMain ?? r.category ?? "").trim()
      if (cat) set.add(cat)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"))
  }, [rows])

  React.useEffect(() => {
    setGoodMax(String(settings.costRatioGoodMax))
    setCautionMax(String(settings.costRatioCautionMax))
    const next: Record<string, string> = {}
    for (const cat of categories) {
      const v = settings.categoryTargets[cat]
      next[cat] = v != null ? String(v) : String(settings.costRatioGoodMax)
    }
    setTargets(next)
  }, [settings, categories])

  const handleSave = async () => {
    if (!canEdit || saving) return
    const good = parseFloat(goodMax)
    const caution = parseFloat(cautionMax)
    if (!Number.isFinite(good) || !Number.isFinite(caution) || good <= 0 || caution <= good) {
      await appAlert(t("posCostSettingsRatioInvalid"))
      return
    }
    const categoryTargets: Record<string, number> = {}
    for (const [cat, raw] of Object.entries(targets)) {
      const n = parseFloat(raw)
      if (Number.isFinite(n) && n > 0) categoryTargets[cat] = n
    }
    setSaving(true)
    try {
      await updateCostSettings({
        defaultMisePercent: 0,
        costRatioGoodMax: good,
        costRatioCautionMax: caution,
        categoryTargets,
      })
      const next: PosCostListSettings = {
        misePercent: 0,
        costRatioGoodMax: good,
        costRatioCautionMax: caution,
        categoryTargets,
      }
      onSaved(next)
      await appAlert(t("msg_save_success"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        data-pos-cost-settings-toggle
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{t("posCostSettingsTitle")}</span>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="border-t px-5 py-4 space-y-4">
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">{t("posCostEditOfficeOnly")}</p>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("posCostSettingsGoodMax")}</Label>
              <Input
                type="number"
                min={1}
                max={100}
                step={0.5}
                value={goodMax}
                onChange={(e) => setGoodMax(e.target.value)}
                disabled={!canEdit}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("posCostSettingsCautionMax")}</Label>
              <Input
                type="number"
                min={1}
                max={100}
                step={0.5}
                value={cautionMax}
                onChange={(e) => setCautionMax(e.target.value)}
                disabled={!canEdit}
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>
          {categories.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-xs">{t("posCostCategoryTargetTitle")}</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                {categories.map((cat) => (
                  <div key={cat} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="flex-1 min-w-0 truncate font-medium">{cat}</span>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      step={0.5}
                      value={targets[cat] ?? goodMax}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [cat]: e.target.value }))}
                      disabled={!canEdit}
                      className="h-8 w-20 font-mono text-right text-xs"
                    />
                    <span className="text-muted-foreground shrink-0">%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("posCostSettingsNoCategories")}</p>
          )}
          {canEdit ? (
            <Button size="sm" className="gap-1.5" onClick={() => void handleSave()} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? t("loading") : t("itemsBtnSave")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
