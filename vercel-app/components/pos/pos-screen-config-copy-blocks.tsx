"use client"

import * as React from "react"
import { ClipboardCopy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { appAlert } from "@/lib/app-message"
import {
  getPosMenuScreenConfig,
  savePosMenuScreenConfig,
  getPosPrinterSettings,
  savePosPrinterSettings,
  getPosPaymentMethodItems,
  savePosPaymentMethodItem,
  deletePosPaymentMethodItem,
  getPosDeliveryApps,
  savePosDeliveryApps,
  getPosCryptoPaymentSettings,
  savePosCryptoPaymentSettings,
  type PosPrinterSettings,
} from "@/lib/api-client"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"

function isSyntheticPaymentMethodId(id: string | undefined): boolean {
  return Boolean(id?.startsWith("syn:"))
}

/** 조리 색상/시간 규칙(타이머)만 — 주방 라우팅·요금은 제외 */
const COOKING_TIMER_COPY_KEYS: (keyof PosPrinterSettings)[] = [
  "cookingFreshMaxMin",
  "cookingWarningMaxMin",
  "cookingRuleMode",
  "cookingRecipeWarningDiffMin",
  "cookingRecipeUrgentDiffMin",
  "cookingDelayBadgeEnabled",
  "cookingDelaySoundEnabled",
  "cookingDelayAlertOverMin",
]

const CUSTOMER_DISPLAY_COPY_KEYS: (keyof PosPrinterSettings)[] = [
  "dualMonitorEnabled",
  "customerDisplayAutoOpen",
  "customerDisplayMonitorPreference",
  "customerDisplayLangMode",
  "customerDisplayLangOverride",
  "customerDisplayTheme",
  "customerDisplayDefaultState",
  "customerDisplayIdleMessage",
  "customerDisplayIdleMediaType",
  "customerDisplayIdleMediaUrl",
  "customerDisplayPaymentMessage",
  "customerDisplayQrPayload",
  "customerDisplayShowOrderSummary",
  "customerDisplayShowOrderTotal",
]

export async function runPosScreenConfigCopyMenu(
  src: string,
  tgt: string,
  tr: (key: string, fallback: string) => string
): Promise<boolean> {
  const s = String(src || "").trim()
  const t = String(tgt || "").trim()
  if (!t) {
    await appAlert(tr("posScreenConfigPickTargetFirst", "먼저 적용 매장을 선택하세요."))
    return false
  }
  if (!s || s === t) {
    await appAlert(tr("posScreenConfigCopyPickOtherStore", "다른 매장을 원본으로 선택하세요."))
    return false
  }
  const scopes: Array<'dine-in' | 'delivery' | 'takeout'> = ['dine-in', 'delivery', 'takeout']
  for (const scope of scopes) {
    const cfg = await getPosMenuScreenConfig({ storeCode: s, scope })
    const res = await savePosMenuScreenConfig({
      storeCode: t,
      scope,
      mainCategoryFontSize: cfg.mainCategoryFontSize,
      categoryFontSize: cfg.categoryFontSize,
      menuTileFontSize: cfg.menuTileFontSize,
      menuTileCols: cfg.menuTileCols,
      menuListFontSize: cfg.menuListFontSize,
      menuListPageSize: cfg.menuListPageSize,
      kioskGroupFontSize: cfg.kioskGroupFontSize,
    })
    if (!res?.success) {
      await appAlert(translateApiMessage(res?.message, (k) => tr(k, k)) || tr("msg_save_fail_detail", "저장에 실패했습니다."))
      return false
    }
  }
  await appAlert(tr("posScreenConfigMenuCopyDone", "메뉴 화면 구성을 복사했습니다. 미리보기 탭을 새로고침하세요."))
  return true
}

export async function runPosScreenConfigCopyCustomerDisplay(
  src: string,
  tgt: string,
  tr: (key: string, fallback: string) => string
): Promise<boolean> {
  const s = String(src || "").trim()
  const t = String(tgt || "").trim()
  if (!t) {
    await appAlert(tr("posScreenConfigPickTargetFirst", "먼저 적용 매장을 선택하세요."))
    return false
  }
  if (!s || s === t) {
    await appAlert(tr("posScreenConfigCopyPickOtherStore", "다른 매장을 원본으로 선택하세요."))
    return false
  }
  const [from, to] = await Promise.all([getPosPrinterSettings({ storeCode: s }), getPosPrinterSettings({ storeCode: t })])
  const merged: PosPrinterSettings = { ...to, storeCode: t }
  const srcRec = from as unknown as Record<string, unknown>
  const m = merged as unknown as Record<string, unknown>
  for (const key of CUSTOMER_DISPLAY_COPY_KEYS) {
    m[String(key)] = srcRec[String(key)]
  }
  const res = await savePosPrinterSettings(posPrinterSettingsToSaveParams(merged))
  if (!res.success) {
    await appAlert(translateApiMessage(res.message, (k) => tr(k, k)) || tr("msg_save_fail_detail", "저장에 실패했습니다."))
    return false
  }
  await appAlert(tr("posScreenConfigDisplayCopyDone", "고객 화면(듀얼 모니터) 설정을 복사해 저장했습니다."))
  return true
}

export async function runPosScreenConfigCopyCooking(
  src: string,
  tgt: string,
  tr: (key: string, fallback: string) => string
): Promise<boolean> {
  const s = String(src || "").trim()
  const t = String(tgt || "").trim()
  if (!t) {
    await appAlert(tr("posScreenConfigPickTargetFirst", "먼저 적용 매장을 선택하세요."))
    return false
  }
  if (!s || s === t) {
    await appAlert(tr("posScreenConfigCopyPickOtherStore", "다른 매장을 원본으로 선택하세요."))
    return false
  }
  const [from, to] = await Promise.all([getPosPrinterSettings({ storeCode: s }), getPosPrinterSettings({ storeCode: t })])
  const merged: PosPrinterSettings = { ...to, storeCode: t }
  const srcRec = from as unknown as Record<string, unknown>
  const m = merged as unknown as Record<string, unknown>
  for (const key of COOKING_TIMER_COPY_KEYS) {
    m[String(key)] = srcRec[String(key)]
  }
  const res = await savePosPrinterSettings(posPrinterSettingsToSaveParams(merged))
  if (!res.success) {
    await appAlert(translateApiMessage(res.message, (k) => tr(k, k)) || tr("msg_save_fail_detail", "저장에 실패했습니다."))
    return false
  }
  await appAlert(tr("posScreenConfigCookingCopyDone", "조리 시간·색상 규칙을 복사해 저장했습니다."))
  return true
}

export async function runPosScreenConfigCopyPayment(
  src: string,
  tgt: string,
  tr: (key: string, fallback: string) => string
): Promise<boolean> {
  const s = String(src || "").trim()
  const t = String(tgt || "").trim()
  if (!t) {
    await appAlert(tr("posScreenConfigPickTargetFirst", "먼저 적용 매장을 선택하세요."))
    return false
  }
  if (!s || s === t) {
    await appAlert(tr("posScreenConfigCopyPickOtherStore", "다른 매장을 원본으로 선택하세요."))
    return false
  }
  const [sourceItems, targetItems] = await Promise.all([
    getPosPaymentMethodItems({ storeCode: s }),
    getPosPaymentMethodItems({ storeCode: t }),
  ])
  const toDelete = targetItems.filter((it) => !isSyntheticPaymentMethodId(it.id))
  for (const it of toDelete) {
    const del = await deletePosPaymentMethodItem({ id: it.id })
    if (!del.success) {
      await appAlert(translateApiMessage(del.message, (k) => tr(k, k)) || tr("msg_save_fail_detail", "저장에 실패했습니다."))
      return false
    }
  }
  const toAdd = sourceItems.filter((it) => !isSyntheticPaymentMethodId(it.id))
  for (const it of toAdd) {
    const res = await savePosPaymentMethodItem({
      storeCode: t,
      category: it.category,
      name: it.name,
      hidden: it.hidden,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, (k) => tr(k, k)) || tr("msg_save_fail_detail", "저장에 실패했습니다."))
      return false
    }
  }
  try {
    const [sourceCrypto, targetCrypto] = await Promise.all([
      getPosCryptoPaymentSettings(s),
      getPosCryptoPaymentSettings(t),
    ])
    await savePosCryptoPaymentSettings({
      storeCode: t,
      enabled: targetCrypto.enabled === true,
      wallets: sourceCrypto.wallets,
      assetsEnabled: sourceCrypto.assetsEnabled,
      rateSource: sourceCrypto.rateSource === "coingecko" ? "coingecko" : "manual",
    })
  } catch {
    /* 지갑 복사는 부가 — 수기 수단 복사는 이미 성공 */
  }
  await appAlert(tr("posScreenConfigPaymentCopyDone", "결제 수단(수기입력) 목록을 복사했습니다."))
  return true
}

export async function runPosScreenConfigCopyDelivery(
  src: string,
  tgt: string,
  tr: (key: string, fallback: string) => string
): Promise<boolean> {
  const s = String(src || "").trim()
  const t = String(tgt || "").trim()
  if (!t) {
    await appAlert(tr("posScreenConfigPickTargetFirst", "먼저 적용 매장을 선택하세요."))
    return false
  }
  if (!s || s === t) {
    await appAlert(tr("posScreenConfigCopyPickOtherStore", "다른 매장을 원본으로 선택하세요."))
    return false
  }
  const apps = await getPosDeliveryApps({ storeCode: s, includeDisabled: true })
  const list = Array.isArray(apps) ? apps : []
  const payload = list
    .filter((i) => String(i.code || "").trim())
    .map((i, idx) => ({
      id: 0,
      code: String(i.code).trim(),
      name: String(i.name || "").trim() || String(i.code).trim(),
      matchKeywords: i.matchKeywords?.length ? i.matchKeywords : [String(i.code).toLowerCase()],
      displayOrder: idx,
      enabled: i.enabled,
      dineOutEnabled: i.dineOutEnabled,
      accentColor: i.accentColor || null,
    }))
  const res = await savePosDeliveryApps({ storeCode: t, items: payload })
  if (!res.success) {
    await appAlert(translateApiMessage(res.message, (k) => tr(k, k)) || tr("msg_save_fail_detail", "저장에 실패했습니다."))
    return false
  }
  await appAlert(tr("posScreenConfigDeliveryCopyDone", "배달앱 인식 설정을 복사했습니다."))
  return true
}

/** 테이블 구성 탭과 동일: `다른 매장에서 복사` 셀렉트 + 복사 버튼만 (한 줄 툴바용) */
export function PosScreenConfigCopyInline({
  variant,
  targetStoreCode,
  stores,
  tr,
  onCopySuccess,
}: {
  variant: "menu" | "display" | "cooking" | "payment" | "delivery"
  targetStoreCode: string
  stores: string[]
  tr: (key: string, fallback: string) => string
  /** 복사 API 성공 후(알림 닫은 뒤) 목록/폼 새로고침 등 */
  onCopySuccess?: () => void
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [source, setSource] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const others = React.useMemo(
    () => stores.filter((s) => s && s !== String(targetStoreCode || "").trim()),
    [stores, targetStoreCode]
  )

  const run = React.useCallback(async () => {
    setBusy(true)
    try {
      let ok = false
      if (variant === "menu") {
        ok = await runPosScreenConfigCopyMenu(source, targetStoreCode, tr)
      } else if (variant === "display") {
        ok = await runPosScreenConfigCopyCustomerDisplay(source, targetStoreCode, tr)
      } else if (variant === "cooking") {
        ok = await runPosScreenConfigCopyCooking(source, targetStoreCode, tr)
      } else if (variant === "payment") {
        ok = await runPosScreenConfigCopyPayment(source, targetStoreCode, tr)
      } else {
        ok = await runPosScreenConfigCopyDelivery(source, targetStoreCode, tr)
      }
      if (ok) onCopySuccess?.()
    } finally {
      setBusy(false)
    }
  }, [source, targetStoreCode, tr, variant, onCopySuccess])

  if (!targetStoreCode || others.length === 0) return null

  const copyLabel = t("posTableLayoutCopyBtn")
  const copyFromPh = t("posTableLayoutCopyFrom")

  return (
    <>
      <Select value={source} onValueChange={setSource}>
        <SelectTrigger
          className="h-10 w-40"
          title={t("posTableLayoutCopyFromHint") || undefined}
        >
          <SelectValue placeholder={copyFromPh !== "posTableLayoutCopyFrom" ? copyFromPh : "다른 매장에서 복사"} />
        </SelectTrigger>
        <SelectContent>
          {others.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 gap-1.5"
        onClick={() => void run()}
        disabled={busy || !source || source === targetStoreCode}
        title={t("posTableLayoutCopyFromHint") || undefined}
      >
        <ClipboardCopy className="h-4 w-4" />
        {busy ? "…" : copyLabel !== "posTableLayoutCopyBtn" ? copyLabel : "복사"}
      </Button>
    </>
  )
}
