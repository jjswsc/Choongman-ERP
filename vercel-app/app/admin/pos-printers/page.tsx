"use client"

import * as React from "react"
import { Printer, Save, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosPrinterSettings,
  getPosMenuCategories,
  savePosPrinterSettings,
  useStoreList,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole, canAccessPosPrinters } from "@/lib/permissions"
import { cn } from "@/lib/utils"

export default function PosPrintersPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [kitchenMode, setKitchenMode] = React.useState<1 | 2>(1)
  const [kitchen1Categories, setKitchen1Categories] = React.useState<string[]>([])
  const [kitchen2Categories, setKitchen2Categories] = React.useState<string[]>([])
  const [autoStockDeduction, setAutoStockDeduction] = React.useState(false)
  const [categories, setCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const canSearchAll = isOfficeRole(auth?.role || "")
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ""

  const loadData = React.useCallback(() => {
    if (!effectiveStore) return
    setLoading(true)
    Promise.all([
      getPosPrinterSettings({ storeCode: effectiveStore }),
      getPosMenuCategories(),
    ])
      .then(([settings, { categories: cats }]) => {
        setKitchenMode((settings.kitchenMode as 1 | 2) || 1)
        setKitchen1Categories(settings.kitchen1Categories || [])
        setKitchen2Categories(settings.kitchen2Categories || [])
        setAutoStockDeduction(Boolean(settings.autoStockDeduction))
        setCategories(cats || [])
      })
      .catch(() => {
        setCategories([])
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

  const toggleKitchen1 = (cat: string) => {
    if (kitchen1Categories.includes(cat)) {
      setKitchen1Categories((prev) => prev.filter((c) => c !== cat))
    } else {
      setKitchen1Categories((prev) => [...prev, cat])
      setKitchen2Categories((prev) => prev.filter((c) => c !== cat))
    }
  }

  const toggleKitchen2 = (cat: string) => {
    if (kitchen2Categories.includes(cat)) {
      setKitchen2Categories((prev) => prev.filter((c) => c !== cat))
    } else {
      setKitchen2Categories((prev) => [...prev, cat])
      setKitchen1Categories((prev) => prev.filter((c) => c !== cat))
    }
  }

  const handleSave = async () => {
    if (!effectiveStore) {
      alert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosPrinterSettings({
        storeCode: effectiveStore,
        kitchenMode,
        kitchen1Categories,
        kitchen2Categories,
        autoStockDeduction,
      })
      if (res.success) {
        alert(t("itemsAlertSaved") || "저장되었습니다.")
        loadData()
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!canAccessPosPrinters(auth?.role || "")) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{t("noPermission") || "접근 권한이 없습니다."}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Printer className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posPrinterSettings") || "프린터 설정"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posPrinterSettingsSub") || "매장별 주방 프린터·카테고리 출력 설정"}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={loadData}
            disabled={loading}
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {effectiveStore && !loading && (
          <div className="space-y-6 rounded-xl border bg-card p-6">
            <div>
              <label className="text-sm font-medium">{t("posKitchenMode") || "주방 프린터 구성"}</label>
              <Select
                value={String(kitchenMode)}
                onValueChange={(v) => setKitchenMode(Number(v) as 1 | 2)}
              >
                <SelectTrigger className="mt-1 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t("posKitchenMode1") || "1대 (통합)"}</SelectItem>
                  <SelectItem value="2">{t("posKitchenMode2") || "2대 (카테고리별)"}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("posKitchenModeHint") || "2대: 치킨→주방1, 한식→주방2 등 카테고리별 출력"}
              </p>
            </div>

            {kitchenMode === 2 && categories.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 text-sm font-semibold">
                    {t("posKitchen1") || "주방 1"}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <label
                        key={cat}
                        className={cn(
                          "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs",
                          kitchen1Categories.includes(cat)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={kitchen1Categories.includes(cat)}
                          onChange={() => toggleKitchen1(cat)}
                          className="mr-1.5"
                        />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 text-sm font-semibold">
                    {t("posKitchen2") || "주방 2"}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <label
                        key={cat}
                        className={cn(
                          "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs",
                          kitchen2Categories.includes(cat)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={kitchen2Categories.includes(cat)}
                          onChange={() => toggleKitchen2(cat)}
                          className="mr-1.5"
                        />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">{t("posAutoStockDeduction") || "자동 재고 차감"}</p>
                <p className="text-xs text-muted-foreground">
                  {t("posAutoStockDeductionHint") || "주문 완료 시 메뉴 BOM에 따라 재고가 자동 차감됩니다. 매장 적응 후 사용하세요."}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoStockDeduction}
                  onChange={(e) => setAutoStockDeduction(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{t("posUse") || "사용"}</span>
              </label>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
              {t("posPrinterNote") ||
                "※ 손님 영수증은 카운터에서 결제 완료 시 브라우저 인쇄로 출력됩니다. 주방 주문서는 추후 연동 예정입니다."}
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "..." : t("itemsBtnSave") || "저장"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
