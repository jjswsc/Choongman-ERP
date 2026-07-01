"use client"

import * as React from "react"
import {
  getMarketingCampaigns,
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
  type MarketingCampaign,
  type MarketingMaterial,
} from "@/lib/api-client"
import { MarketingMaterialChecklistPanel } from "@/components/marketing/marketing-material-checklist-panel"
import {
  filterCampaignsWithStoreChecklistMaterials,
  pickCampaignIdWithPendingStoreTasks,
} from "@/lib/marketing-material-checklist-utils"
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
  const [allCampaigns, setAllCampaigns] = React.useState<MarketingCampaign[]>([])
  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [campaignId, setCampaignId] = React.useState("")
  const [bootLoading, setBootLoading] = React.useState(true)
  const autoPickedRef = React.useRef(false)

  const hqLabel = React.useMemo(() => {
    if (lang === "th") return "ส่วนกลางสำนักงานใหญ่"
    if (lang === "ko") return "본사공용"
    return "HQ-wide"
  }, [lang])

  const emptyCampaignsMessage = React.useMemo(() => {
    if (lang === "ko") return "이 매장에 등록된 홍보물이 있는 캠페인이 없습니다."
    if (lang === "th") return "ไม่มีแคมเปญที่มีสื่อโปรโมชันสำหรับสาขานี้"
    return "No campaigns with marketing materials for this store."
  }, [lang])

  const campaigns = React.useMemo(
    () => filterCampaignsWithStoreChecklistMaterials(allCampaigns, materials, storeName, hqLabel),
    [allCampaigns, materials, storeName, hqLabel]
  )

  const loadData = React.useCallback(async () => {
    const [campRows, matRows] = await Promise.all([
      getMarketingCampaigns(),
      getMarketingMaterials(),
    ])
    setAllCampaigns(Array.isArray(campRows) ? campRows : [])
    setMaterials(Array.isArray(matRows) ? matRows : [])
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setBootLoading(true)
    void (async () => {
      try {
        await loadData()
      } finally {
        if (!cancelled) setBootLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadData])

  React.useEffect(() => {
    autoPickedRef.current = false
    setCampaignId("")
  }, [storeName])

  React.useEffect(() => {
    if (campaignId && !campaigns.some((c) => String(c.id) === campaignId)) {
      setCampaignId("")
      autoPickedRef.current = false
    }
  }, [campaigns, campaignId])

  React.useEffect(() => {
    const store = String(storeName || "").trim()
    if (!store || campaigns.length === 0 || campaignId.trim() || autoPickedRef.current) return
    let cancelled = false
    void (async () => {
      try {
        const checks = await getMarketingMaterialStoreChecks()
        if (cancelled) return
        const picked = pickCampaignIdWithPendingStoreTasks(
          campaigns,
          materials,
          Array.isArray(checks) ? checks : [],
          store,
          hqLabel
        )
        autoPickedRef.current = true
        if (picked) setCampaignId(picked)
        else if (campaigns.length === 1) setCampaignId(String(campaigns[0]?.id || ""))
      } catch {
        autoPickedRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storeName, campaigns, materials, campaignId, hqLabel])

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

  if (campaigns.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyCampaignsMessage}</div>
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
          await loadData()
          onDataChanged?.()
        }}
      />
    </div>
  )
}
