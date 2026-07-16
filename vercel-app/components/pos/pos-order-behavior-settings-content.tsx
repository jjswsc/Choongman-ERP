"use client"

import * as React from "react"
import { Save, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { appAlert } from "@/lib/app-message"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { localizeApiMessage } from "@/lib/translate-api-message"
import {
  getPosPrinterSettings,
  savePosPrinterSettings,
  useStoreList,
  type PosPrinterSettings,
} from "@/lib/api-client"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import { canPickPosTerminalStore } from "@/lib/permissions"
import { PosScreenConfigEmeraldSaveButton } from "@/components/pos/pos-screen-config-action-bar"
import { PosScreenConfigStoreAndCopyRow } from "@/components/pos/pos-screen-config-store-and-copy-row"

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
  yesLabel: string
  noLabel: string
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={value ? "default" : "outline"}
            className="min-w-[4.5rem]"
            onClick={() => onChange(true)}
          >
            {yesLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={!value ? "default" : "outline"}
            className="min-w-[4.5rem]"
            onClick={() => onChange(false)}
          >
            {noLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PosOrderBehaviorSettingsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: stores } = useStoreList()
  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      return v && v !== key ? v : fallback
    },
    [t]
  )
  const yesLabel = tr("yes", "예")
  const noLabel = tr("no", "아니오")

  const [storeCode, setStoreCode] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [requireGuestCount, setRequireGuestCount] = React.useState(true)

  const canSearchAll = canPickPosTerminalStore(auth?.role || "", auth?.store || "")
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ""

  const loadData = React.useCallback((): Promise<void> => {
    if (!effectiveStore) return Promise.resolve()
    setLoading(true)
    return getPosPrinterSettings({ storeCode: effectiveStore })
      .then((settings) => {
        setRequireGuestCount(settings.requireGuestCount !== false)
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
    void loadData()
  }, [loadData])

  const handleSave = async () => {
    if (!effectiveStore) return
    setSaving(true)
    try {
      const latest = await getPosPrinterSettings({ storeCode: effectiveStore })
      const merged: PosPrinterSettings = {
        ...latest,
        storeCode: effectiveStore,
        requireGuestCount,
      }
      const res = await savePosPrinterSettings(
        posPrinterSettingsToSaveParams(merged, { omitKitchenRoutes: true })
      )
      if (res.success) {
        await appAlert(tr("itemsAlertSaved", "저장되었습니다."))
        await loadData()
      } else {
        await appAlert(localizeApiMessage(res.message, t, tr("msg_save_fail_detail", "저장에 실패했습니다."), lang))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <PosScreenConfigStoreAndCopyRow
        canPickStore={canSearchAll}
        stores={stores}
        pickedStore={storeCode}
        onPickedStoreChange={setStoreCode}
        readOnlyStoreCode={auth?.store}
        effectiveStore={effectiveStore}
        showCopy={false}
        copyVariant="cooking"
        tr={tr}
        onRefresh={() => void loadData()}
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">{tr("loading", "불러오는 중…")}</p>
      ) : (
        <>
          <ToggleRow
            label={tr("posRequireGuestCount", "홀 주문 시 손님 수 필수")}
            hint={tr(
              "posRequireGuestCountHint",
              "켜면 테이블 주문 전에 손님 수를 입력해야 합니다. 끄면 손님 수 없이도 주문할 수 있습니다."
            )}
            value={requireGuestCount}
            onChange={setRequireGuestCount}
            yesLabel={yesLabel}
            noLabel={noLabel}
          />
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {tr(
                "posRequireGuestCountNote",
                "손님 수 UI는 홀 주문에서 계속 표시됩니다. 필수만 해제되며, 입력한 값은 매출·테이블 표시에 그대로 쓰입니다."
              )}
            </span>
          </div>
          <PosScreenConfigEmeraldSaveButton
            onClick={() => void handleSave()}
            disabled={!effectiveStore || saving || loading}
          >
            <Save className="h-4 w-4" aria-hidden />
            {saving ? "..." : tr("itemsBtnSave", "저장")}
          </PosScreenConfigEmeraldSaveButton>
        </>
      )}
    </div>
  )
}
