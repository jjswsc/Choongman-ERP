"use client"

import * as React from "react"
import { Printer, Save } from "lucide-react"
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
import { isOfficeRole } from "@/lib/permissions"

export default function PosPrintersPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [kitchenCount, setKitchenCount] = React.useState(1)
  const [kitchen1Categories, setKitchen1Categories] = React.useState<string[]>([])
  const [kitchen2Categories, setKitchen2Categories] = React.useState<string[]>([])
  const [allCategories, setAllCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const canSearchAll = isOfficeRole(auth?.role || "")

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreCode(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  const loadData = React.useCallback(() => {
    if (!storeCode) return
    setLoading(true)
    Promise.all([
      getPosPrinterSettings({ storeCode }),
      getPosMenuCategories(),
    ])
      .then(([settings, { categories }]) => {
        setKitchenCount(settings.kitchenCount ?? 1)
        setKitchen1Categories(settings.kitchen1Categories ?? [])
        setKitchen2Categories(settings.kitchen2Categories ?? [])
        setAllCategories(categories || [])
      })
      .catch(() => {
        setAllCategories([])
      })
      .finally(() => setLoading(false))
  }, [storeCode])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const toggleCategory = (
    category: string,
    target: "kitchen1" | "kitchen2",
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const has = current.includes(category)
    if (has) {
      setter((prev) => prev.filter((c) => c !== category))
    } else {
      setter((prev) => [...prev, category])
    }
  }

  const handleSave = async () => {
    if (!storeCode) {
      alert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosPrinterSettings({
        storeCode,
        kitchenCount,
        kitchen1Categories,
        kitchen2Categories,
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
              {t("posPrinterSettingsSub") || "매장별 주방 프린터 구성을 설정합니다."}
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-3">
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
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {storeCode && !loading && (
          <div className="space-y-6 rounded-xl border bg-card p-6">
            <div>
              <label className="text-sm font-medium">{t("posKitchenPrinterCount") || "주방 프린터"}</label>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="kitchenCount"
                    checked={kitchenCount === 1}
                    onChange={() => setKitchenCount(1)}
                  />
                  {t("posKitchen1Unit") || "1대 (통합)"}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="kitchenCount"
                    checked={kitchenCount === 2}
                    onChange={() => setKitchenCount(2)}
                  />
                  {t("posKitchen2Units") || "2대 (카테고리별)"}
                </label>
              </div>
            </div>

            {kitchenCount === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">
                    {t("posKitchen1Categories") || "주방 1 (예: 치킨)"}
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          toggleCategory(c, "kitchen1", kitchen1Categories, setKitchen1Categories)
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          kitchen1Categories.includes(c)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    {t("posKitchen2Categories") || "주방 2 (예: 한식)"}
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {allCategories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          toggleCategory(c, "kitchen2", kitchen2Categories, setKitchen2Categories)
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          kitchen2Categories.includes(c)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "..." : t("itemsBtnSave") || "저장"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
