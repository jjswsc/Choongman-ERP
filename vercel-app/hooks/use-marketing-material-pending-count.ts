"use client"

import * as React from "react"
import {
  getMarketingCampaigns,
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
} from "@/lib/api-client"
import { countPendingStoreMaterialTasks } from "@/lib/marketing-material-checklist-utils"
import { useLang } from "@/lib/lang-context"

const REFRESH_MS = 5 * 60 * 1000

export function useMarketingMaterialPendingCount(storeName: string): {
  count: number
  reload: () => void
} {
  const { lang } = useLang()
  const hqLabel = React.useMemo(() => {
    if (lang === "th") return "ส่วนกลางสำนักงานใหญ่"
    if (lang === "ko") return "본사공용"
    return "HQ-wide"
  }, [lang])

  const [count, setCount] = React.useState(0)
  const [tick, setTick] = React.useState(0)
  const reload = React.useCallback(() => setTick((n) => n + 1), [])

  const load = React.useCallback(async () => {
    const store = String(storeName || "").trim()
    if (!store) {
      setCount(0)
      return
    }
    try {
      const [materials, checks] = await Promise.all([
        getMarketingMaterials(),
        getMarketingMaterialStoreChecks(),
      ])
      const mats = Array.isArray(materials) ? materials : []
      const chks = Array.isArray(checks) ? checks : []
      setCount(countPendingStoreMaterialTasks(mats, chks, store, hqLabel))
    } catch {
      setCount(0)
    }
  }, [storeName, hqLabel])

  React.useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load, tick])

  return { count, reload }
}
