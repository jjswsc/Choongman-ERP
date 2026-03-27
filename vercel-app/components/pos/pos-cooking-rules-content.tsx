"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Bell, Clock3, Copy, RotateCw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosPrinterSettings, savePosPrinterSettings, useStoreList } from "@/lib/api-client"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"

export function PosCookingRulesContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [baseSettings, setBaseSettings] = React.useState<{
    kitchenMode: 1 | 2 | 3
    kitchen1Categories: string[]
    kitchen2Categories: string[]
    kitchen3Categories: string[]
    autoStockDeduction?: boolean
    deliveryFee?: number
    packagingFee?: number
  } | null>(null)

  const [freshMax, setFreshMax] = React.useState("10")
  const [warningMax, setWarningMax] = React.useState("15")
  const [ruleMode, setRuleMode] = React.useState<"elapsed" | "recipe_diff">("elapsed")
  const [recipeWarnDiff, setRecipeWarnDiff] = React.useState("0")
  const [recipeUrgentDiff, setRecipeUrgentDiff] = React.useState("5")
  const [delayBadgeEnabled, setDelayBadgeEnabled] = React.useState(true)
  const [delaySoundEnabled, setDelaySoundEnabled] = React.useState(false)
  const [delayAlertOverMin, setDelayAlertOverMin] = React.useState("0")
  const [copySourceStore, setCopySourceStore] = React.useState("")
  const [copyTargetStore, setCopyTargetStore] = React.useState("")
  const [copying, setCopying] = React.useState(false)

  const canSearchAll = isOfficeRole(auth?.role || "")
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ""

  const loadData = React.useCallback((): Promise<void> => {
    if (!effectiveStore) return Promise.resolve()
    setLoading(true)
    return getPosPrinterSettings({ storeCode: effectiveStore })
      .then((settings) => {
        setBaseSettings({
          kitchenMode: (Math.min(3, Math.max(1, Number(settings.kitchenMode) || 1)) as 1 | 2 | 3),
          kitchen1Categories: settings.kitchen1Categories || [],
          kitchen2Categories: settings.kitchen2Categories || [],
          kitchen3Categories: settings.kitchen3Categories || [],
          autoStockDeduction: settings.autoStockDeduction,
          deliveryFee: settings.deliveryFee,
          packagingFee: settings.packagingFee,
        })
        setFreshMax(String(settings.cookingFreshMaxMin ?? 10))
        setWarningMax(String(settings.cookingWarningMaxMin ?? 15))
        setRuleMode(settings.cookingRuleMode === "recipe_diff" ? "recipe_diff" : "elapsed")
        setRecipeWarnDiff(String(settings.cookingRecipeWarningDiffMin ?? 0))
        setRecipeUrgentDiff(String(settings.cookingRecipeUrgentDiffMin ?? 5))
        setDelayBadgeEnabled(settings.cookingDelayBadgeEnabled === false ? false : true)
        setDelaySoundEnabled(Boolean(settings.cookingDelaySoundEnabled))
        setDelayAlertOverMin(String(settings.cookingDelayAlertOverMin ?? 0))
      })
      .finally(() => setLoading(false))
  }, [effectiveStore])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreCode(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (!copySourceStore && stores.length > 0) setCopySourceStore(stores[0])
    if (!copyTargetStore && stores.length > 0) setCopyTargetStore(stores[0])
  }, [stores, copySourceStore, copyTargetStore])

  const handleSave = async () => {
    if (!effectiveStore) return
    setSaving(true)
    try {
      const fresh = Math.max(1, Number(freshMax) || 10)
      const warning = Math.max(fresh + 1, Number(warningMax) || 15)
      const warnDiff = Math.max(0, Number(recipeWarnDiff) || 0)
      const urgentDiff = Math.max(warnDiff + 1, Number(recipeUrgentDiff) || 5)
      const delayOver = Math.max(0, Number(delayAlertOverMin) || 0)
      const res = await savePosPrinterSettings({
        storeCode: effectiveStore,
        kitchenMode: baseSettings?.kitchenMode || 1,
        kitchen1Categories: baseSettings?.kitchen1Categories || [],
        kitchen2Categories: baseSettings?.kitchen2Categories || [],
        kitchen3Categories: baseSettings?.kitchen3Categories || [],
        autoStockDeduction: baseSettings?.autoStockDeduction,
        deliveryFee: baseSettings?.deliveryFee,
        packagingFee: baseSettings?.packagingFee,
        cookingFreshMaxMin: fresh,
        cookingWarningMaxMin: warning,
        cookingRuleMode: ruleMode,
        cookingRecipeWarningDiffMin: warnDiff,
        cookingRecipeUrgentDiffMin: urgentDiff,
        cookingDelayBadgeEnabled: delayBadgeEnabled,
        cookingDelaySoundEnabled: delaySoundEnabled,
        cookingDelayAlertOverMin: delayOver,
      })
      if (res.success) {
        await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
        await loadData()
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const parseRuleValues = React.useCallback(() => {
    const fresh = Math.max(1, Number(freshMax) || 10)
    const warning = Math.max(fresh + 1, Number(warningMax) || 15)
    const warnDiff = Math.max(0, Number(recipeWarnDiff) || 0)
    const urgentDiff = Math.max(warnDiff + 1, Number(recipeUrgentDiff) || 5)
    const delayOver = Math.max(0, Number(delayAlertOverMin) || 0)
    return { fresh, warning, warnDiff, urgentDiff, delayOver }
  }, [freshMax, warningMax, recipeWarnDiff, recipeUrgentDiff, delayAlertOverMin])

  const applySettingsToForm = (settings: Awaited<ReturnType<typeof getPosPrinterSettings>>) => {
    setFreshMax(String(settings.cookingFreshMaxMin ?? 10))
    setWarningMax(String(settings.cookingWarningMaxMin ?? 15))
    setRuleMode(settings.cookingRuleMode === "recipe_diff" ? "recipe_diff" : "elapsed")
    setRecipeWarnDiff(String(settings.cookingRecipeWarningDiffMin ?? 0))
    setRecipeUrgentDiff(String(settings.cookingRecipeUrgentDiffMin ?? 5))
    setDelayBadgeEnabled(settings.cookingDelayBadgeEnabled === false ? false : true)
    setDelaySoundEnabled(Boolean(settings.cookingDelaySoundEnabled))
    setDelayAlertOverMin(String(settings.cookingDelayAlertOverMin ?? 0))
  }

  const handleCopyFromStore = async () => {
    if (!copySourceStore) return
    setCopying(true)
    try {
      const s = await getPosPrinterSettings({ storeCode: copySourceStore })
      applySettingsToForm(s)
      await appAlert(t("posCookingCopyLoadedHint") || "선택한 매장 설정을 불러왔습니다. 저장 버튼을 눌러 현재 매장에 반영하세요.")
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setCopying(false)
    }
  }

  const handleCopyToStore = async () => {
    if (!copyTargetStore) return
    const { fresh, warning, warnDiff, urgentDiff, delayOver } = parseRuleValues()
    setCopying(true)
    try {
      const targetBase = await getPosPrinterSettings({ storeCode: copyTargetStore })
      const res = await savePosPrinterSettings({
        storeCode: copyTargetStore,
        kitchenMode: targetBase.kitchenMode || 1,
        kitchen1Categories: targetBase.kitchen1Categories || [],
        kitchen2Categories: targetBase.kitchen2Categories || [],
        kitchen3Categories: targetBase.kitchen3Categories || [],
        autoStockDeduction: targetBase.autoStockDeduction,
        deliveryFee: targetBase.deliveryFee,
        packagingFee: targetBase.packagingFee,
        cookingFreshMaxMin: fresh,
        cookingWarningMaxMin: warning,
        cookingRuleMode: ruleMode,
        cookingRecipeWarningDiffMin: warnDiff,
        cookingRecipeUrgentDiffMin: urgentDiff,
        cookingDelayBadgeEnabled: delayBadgeEnabled,
        cookingDelaySoundEnabled: delaySoundEnabled,
        cookingDelayAlertOverMin: delayOver,
      })
      if (res.success) {
        await appAlert(t("posCookingCopySaved") || "현재 규칙을 대상 매장에 복사 저장했습니다.")
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setCopying(false)
    }
  }

  const preview = React.useMemo(() => {
    const { fresh, warning, warnDiff, urgentDiff, delayOver } = parseRuleValues()
    const elapsedFresh = Math.max(0, fresh - 1)
    const elapsedWarning = fresh
    const elapsedUrgent = warning
    const recipeFresh = Math.max(0, 12 + warnDiff - 1)
    const recipeWarning = 12 + warnDiff
    const recipeUrgent = 12 + urgentDiff
    const delayedMin = ruleMode === "elapsed" ? warning + delayOver : 12 + urgentDiff + delayOver
    return {
      elapsedFresh,
      elapsedWarning,
      elapsedUrgent,
      recipeFresh,
      recipeWarning,
      recipeUrgent,
      delayedMin,
    }
  }, [parseRuleValues, ruleMode])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={storeCode} onValueChange={setStoreCode}>
          <SelectTrigger className="h-10 w-40">
            <SelectValue placeholder={t("store") || "매장"} />
          </SelectTrigger>
          <SelectContent>
            {stores.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadData} disabled={loading}>
          <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh") || "새로고침"}
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock3 className="h-4 w-4" />
          {t("posCookingRulesTitle") || "조리 색상 규칙"}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">{t("posCookingFreshMaxMin") || "신선 구간 최대(분)"}</label>
            <Input type="number" min={1} value={freshMax} onChange={(e) => setFreshMax(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("posCookingWarningMaxMin") || "주의 구간 최대(분)"}</label>
            <Input type="number" min={2} value={warningMax} onChange={(e) => setWarningMax(e.target.value)} className="mt-1 h-9" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">{t("posCookingRuleMode") || "색상 판단 기준"}</label>
          <Select value={ruleMode} onValueChange={(v) => setRuleMode(v as "elapsed" | "recipe_diff")}>
            <SelectTrigger className="mt-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="elapsed">{t("posCookingRuleElapsed") || "주문 경과시간 기준"}</SelectItem>
              <SelectItem value="recipe_diff">{t("posCookingRuleRecipeDiff") || "메뉴 레시피 시간 대비 기준"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">{t("posCookingRecipeWarnDiff") || "레시피 대비 주의(+분)"}</label>
            <Input type="number" min={0} value={recipeWarnDiff} onChange={(e) => setRecipeWarnDiff(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-sm font-medium">{t("posCookingRecipeUrgentDiff") || "레시피 대비 지연(+분)"}</label>
            <Input type="number" min={1} value={recipeUrgentDiff} onChange={(e) => setRecipeUrgentDiff(e.target.value)} className="mt-1 h-9" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm">{t("posCookingDelayBadgeEnabled") || "지연 배지 표시"}</span>
            <input type="checkbox" checked={delayBadgeEnabled} onChange={(e) => setDelayBadgeEnabled(e.target.checked)} className="h-4 w-4" />
          </label>
          <label className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm">{t("posCookingDelaySoundEnabled") || "지연 알림음"}</span>
            <input type="checkbox" checked={delaySoundEnabled} onChange={(e) => setDelaySoundEnabled(e.target.checked)} className="h-4 w-4" />
          </label>
          <div>
            <label className="text-sm font-medium">{t("posCookingDelayAlertOverMin") || "지연 임계(+분)"}</label>
            <Input type="number" min={0} value={delayAlertOverMin} onChange={(e) => setDelayAlertOverMin(e.target.value)} className="mt-1 h-9" />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Bell className="h-4 w-4" />
            {t("posCookingPreviewTitle") || "미리보기"}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-lime-600 bg-lime-400/95 px-2 py-1 text-xs font-semibold text-lime-950">
              {(t("posCookingPreviewFresh") || "신선")}: {ruleMode === "elapsed" ? preview.elapsedFresh : preview.recipeFresh}{t("posMinuteUnit") || "분"}
            </div>
            <div className="rounded-md border border-amber-600 bg-amber-500/90 px-2 py-1 text-xs font-semibold text-amber-950">
              {(t("posCookingPreviewWarning") || "주의")}: {ruleMode === "elapsed" ? preview.elapsedWarning : preview.recipeWarning}{t("posMinuteUnit") || "분"}
            </div>
            <div className="rounded-md border border-red-600 bg-red-500/90 px-2 py-1 text-xs font-semibold text-red-950">
              {(t("posCookingPreviewUrgent") || "긴급")}: {ruleMode === "elapsed" ? preview.elapsedUrgent : preview.recipeUrgent}{t("posMinuteUnit") || "분"}
            </div>
            <div className="rounded-md border border-red-800 bg-red-950 px-2 py-1 text-xs font-bold text-red-100">
              {delayBadgeEnabled ? (t("posCookingPreviewDelayBadgeOn") || "지연 배지 ON") : (t("posCookingPreviewDelayBadgeOff") || "지연 배지 OFF")} · {preview.delayedMin}{t("posMinuteUnit") || "분"}+
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Copy className="h-4 w-4" />
            {t("posCookingCopyTitle") || "매장 간 설정 복사"}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("posCookingCopyLoadFromStore") || "다른 매장 설정 가져오기"}</label>
              <div className="flex gap-2">
                <Select value={copySourceStore} onValueChange={setCopySourceStore}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("posCookingStorePlaceholder") || "매장 선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={`src-${s}`} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-9" onClick={handleCopyFromStore} disabled={copying || !copySourceStore}>
                  {t("posCookingCopyLoadButton") || "불러오기"}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("posCookingCopySaveToStore") || "현재 설정 다른 매장에 복사"}</label>
              <div className="flex gap-2">
                <Select value={copyTargetStore} onValueChange={setCopyTargetStore}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("posCookingStorePlaceholder") || "매장 선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={`dst-${s}`} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="h-9" onClick={handleCopyToStore} disabled={copying || !copyTargetStore}>
                  {t("posCookingCopySaveButton") || "복사 저장"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
          {t("posCookingGuide") || "메뉴별 기준시간은 POS 메뉴의 `조리시간(분)` 값을 사용합니다. 미설정 메뉴는 경과시간 기준으로 판단됩니다."}
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={saving || !effectiveStore || loading || !baseSettings}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "..." : t("itemsBtnSave") || "저장"}
        </Button>
      </div>
    </div>
  )
}
