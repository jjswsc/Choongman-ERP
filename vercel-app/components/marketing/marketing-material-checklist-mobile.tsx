"use client"

import * as React from "react"
import {
  getMarketingCampaigns,
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
  type MarketingCampaign,
} from "@/lib/api-client"
import { MarketingMaterialChecklistPanel } from "@/components/marketing/marketing-material-checklist-panel"
import { pickCampaignIdWithPendingStoreTasks } from "@/lib/marketing-material-checklist-utils"
import { useLang } from "@/lib/lang-context"
import { useStoreList } from "@/lib/use-store-list"
import { Loader2 } from "lucide-react"

type Props = {
  storeName: string
  onDataChanged?: () => void
}

export function MarketingMaterialChecklistMobile({ storeName, onDataChanged }: Props) {
  const { lang } = useLang()
  const { stores, formatStoreLabel } = useStoreList()
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [campaignId, setCampaignId] = React.useState("")
  const [bootLoading, setBootLoading] = React.useState(true)
  const autoPickedRef = React.useRef(false)

  const hqLabel = React.useMemo(() => {
    if (lang === "th") return "ส่วนกลางสำนักงานใหญ่"
    if (lang === "ko") return "본사공용"
    return "HQ-wide"
  }, [lang])

  const loadCampaigns = React.useCallback(async () => {
    const rows = await getMarketingCampaigns()
    setCampaigns(Array.isArray(rows) ? rows : [])
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setBootLoading(true)
    void (async () => {
      try {
        await loadCampaigns()
      } finally {
        if (!cancelled) setBootLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadCampaigns])

  React.useEffect(() => {
    autoPickedRef.current = false
    setCampaignId("")
  }, [storeName])

  React.useEffect(() => {
    const store = String(storeName || "").trim()
    if (!store || campaigns.length === 0 || campaignId.trim() || autoPickedRef.current) return
    let cancelled = false
    void (async () => {
      try {
        const [materials, checks] = await Promise.all([
          getMarketingMaterials(),
          getMarketingMaterialStoreChecks(),
        ])
        if (cancelled) return
        const picked = pickCampaignIdWithPendingStoreTasks(
          campaigns,
          Array.isArray(materials) ? materials : [],
          Array.isArray(checks) ? checks : [],
          store,
          hqLabel
        )
        autoPickedRef.current = true
        if (picked) setCampaignId(picked)
      } catch {
        autoPickedRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeName, campaigns, campaignId, hqLabel])

  if (!String(storeName || "").trim()) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        {lang === "ko"
          ? "매장 정보가 없어 홍보물을 확인할 수 없습니다."
          : lang === "th"
            ? "ไม่มีข้อมูลสาขา จึงดูสื่อโปรโมชันไม่ได้"
            : "Store is not set. Cannot load marketing materials."}
      </div>
    )
  }

  if (bootLoading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pb-4">
      <MarketingMaterialChecklistPanel
        mobileMode
        storeNameOverride={storeName}
        campaignId={campaignId}
        onCampaignIdChange={setCampaignId}
        campaigns={campaigns}
        hqLabel={hqLabel}
        formatStoreLabel={formatStoreLabel}
        stores={stores}
        onRefreshParent={async () => {
          await loadCampaigns()
          onDataChanged?.()
        }}
      />
    </div>
  )
}
