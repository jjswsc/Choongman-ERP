"use client"

import * as React from "react"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  RotateCw,
  ExternalLink,
  LayoutGrid,
  Store,
  Plus,
  Save,
  Loader2,
  Trash2,
  Pencil,
  Settings2,
  Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  getMarketingMaterials,
  getMarketingMaterialDeployments,
  getMarketingCampaigns,
  getMarketingMaterialGifts,
  saveMarketingMaterial,
  saveMarketingMaterialDeployment,
  saveMarketingCampaignDesignDates,
  deleteMarketingMaterial,
  useStoreList,
  type MarketingMaterialDeployment,
  type MarketingMaterial,
  type MarketingCampaign,
  type MarketingMaterialGift,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { getBangkokDateStr } from "@/lib/pos-business-day"
import { addDaysYmd } from "@/lib/pos-business-day"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { MarketingMaterialGiftsPanel } from "@/components/marketing/material-gifts-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MarketingPageHero } from "@/components/marketing/marketing-page-hero"
import { MarketingPageShell } from "@/components/marketing/marketing-page-shell"
import { MarketingHubCampaignContextStrip } from "@/components/marketing/marketing-hub-campaign-context-strip"
import { MarketingLinkedCampaignStrip } from "@/components/marketing/marketing-linked-campaign-strip"
import { MarketingMaterialPicklistsDialog } from "@/components/marketing/marketing-material-picklists-dialog"
import { MarketingMaterialDeploymentEditor } from "@/components/marketing/marketing-material-deployment-editor"
import { MarketingHubRecordScheduleCard } from "@/components/marketing/marketing-hub-record-schedule-card"
import {
  defaultMarketingMaterialTypeOptions,
  loadMarketingMaterialTypeOptions,
  materialTypeSelectOptions,
  resolveMaterialTypeLabel,
  type MarketingMaterialTypeOption,
} from "@/lib/marketing-material-type-options"
import {
  defaultMarketingMaterialPlacementOptions,
  loadMarketingMaterialPlacementOptions,
  resolvePlacementLabel,
  type MarketingMaterialPlacementOption,
} from "@/lib/marketing-material-placement-options"

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-700",
  producing: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  distributed: "bg-green-100 text-green-800",
}

const MATERIAL_STATUS_VALUES = ["planning", "producing", "completed", "distributed"] as const

function defaultMaterialAddForm() {
  return {
    type: "tentcard" as string,
    name: "",
    quantity: "1",
    unitCost: "",
    actualCost: "",
    branches: [] as string[],
    isHqWide: false,
    displayStartDate: "",
    displayEndDate: "",
    placementSpots: [] as string[],
    status: "planning" as string,
    note: "",
  }
}

type ViewMode = "store" | "material"
type MainTab = "overview" | "gifts"
type MaterialsBrowseTab = "register" | "browse" | "all"
type MaterialDeploymentDraft = {
  storeName: string
  placementSpot: string
  materialType: string
  installedOn: string
  removedOn: string
  note: string
}

export default function MarketingMaterialsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""
  const mainTab: MainTab = searchParams.get("tab") === "gifts" ? "gifts" : "overview"

  const setMainTab = React.useCallback(
    (tab: MainTab) => {
      const p = new URLSearchParams(searchParams.toString())
      if (tab === "gifts") p.set("tab", "gifts")
      else p.delete("tab")
      const qs = p.toString()
      router.replace(qs ? `/admin/marketing/materials?${qs}` : "/admin/marketing/materials")
    },
    [router, searchParams]
  )

  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [materialGifts, setMaterialGifts] = React.useState<MarketingMaterialGift[]>([])
  const [materialDeployments, setMaterialDeployments] = React.useState<MarketingMaterialDeployment[]>([])
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<ViewMode>("store")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [hqFilter, setHqFilter] = React.useState<"" | "hq" | "store">("")
  const [spotFilter, setSpotFilter] = React.useState("")
  const [depStatusFilter, setDepStatusFilter] = React.useState<"" | "active" | "removed">("")
  const [depDateFrom, setDepDateFrom] = React.useState("")
  const [depDateTo, setDepDateTo] = React.useState("")
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [materialAddForm, setMaterialAddForm] = React.useState(defaultMaterialAddForm)
  const [savingMaterialAdd, setSavingMaterialAdd] = React.useState(false)
  const [materialsBrowseTab, setMaterialsBrowseTab] = React.useState<MaterialsBrowseTab>("register")
  const [allMaterials, setAllMaterials] = React.useState<MarketingMaterial[]>([])
  const [inquiryLoading, setInquiryLoading] = React.useState(false)
  const [inqStoreFilter, setInqStoreFilter] = React.useState("")
  const [inqHqFilter, setInqHqFilter] = React.useState<"" | "hq" | "store">("")
  const [inqSpotFilter, setInqSpotFilter] = React.useState("")
  const [inqDepStatusFilter, setInqDepStatusFilter] = React.useState<"" | "active" | "removed">("")
  const [inqDepDateFrom, setInqDepDateFrom] = React.useState("")
  const [inqDepDateTo, setInqDepDateTo] = React.useState("")
  const [inqMatStatus, setInqMatStatus] = React.useState<string>("")
  const [inqSearch, setInqSearch] = React.useState("")
  const [materialTypeOptions, setMaterialTypeOptions] = React.useState<MarketingMaterialTypeOption[]>(
    defaultMarketingMaterialTypeOptions
  )
  const [materialPicklistsDialogOpen, setMaterialPicklistsDialogOpen] = React.useState(false)
  const [placementOptions, setPlacementOptions] = React.useState<MarketingMaterialPlacementOption[]>(
    defaultMarketingMaterialPlacementOptions
  )
  const [hubDesignStart, setHubDesignStart] = React.useState("")
  const [hubDesignEnd, setHubDesignEnd] = React.useState("")
  const [materialDeploymentDrafts, setMaterialDeploymentDrafts] = React.useState<MaterialDeploymentDraft[]>([])
  const [openDeploymentEditorKeys, setOpenDeploymentEditorKeys] = React.useState<Set<string>>(
    () => new Set()
  )

  const { stores, formatStoreLabel } = useStoreList()

  const activeCampaignId = (campaignFilter || campaignIdFromQuery || "").trim()

  const formatMatDisplayPeriod = React.useCallback((start: string | null | undefined, end: string | null | undefined) => {
    const a = (start || "").trim()
    const b = (end || "").trim()
    if (!a && !b) return ""
    if (a && b) return `${a} ~ ${b}`
    if (a) return `${a} ~`
    return `~ ${b}`
  }, [])

  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      if (lang === "ko") return ko
      return en
    },
    [lang]
  )

  const formatDeploymentPeriod = React.useCallback(
    (installedOn: string | null | undefined, removedOn: string | null | undefined) => {
      const a = (installedOn || "").trim()
      const b = (removedOn || "").trim()
      if (!a && !b) return ""
      if (a && b) return `${a} ~ ${b}`
      if (a) return `${a} ~ ${tr("진행중", "active", "กำลังติดตั้ง")}`
      return `~ ${b}`
    },
    [tr]
  )

  const materialTypeLabel = React.useCallback(
    (value: string) => resolveMaterialTypeLabel(value, materialTypeOptions, tr),
    [materialTypeOptions, tr]
  )

  const materialStatusLabel = React.useCallback(
    (value: string) => {
      switch (value) {
        case "planning":
          return tr("계획중", "Planning", "วางแผน")
        case "producing":
          return tr("제작중", "Producing", "กำลังผลิต")
        case "completed":
          return tr("완료", "Completed", "เสร็จแล้ว")
        case "distributed":
          return tr("배포완료", "Distributed", "แจกจ่ายแล้ว")
        default:
          return value
      }
    },
    [tr]
  )
  const materialPlacementSpotLabel = React.useCallback(
    (value: string) => resolvePlacementLabel(value, placementOptions, tr),
    [placementOptions, tr]
  )

  const loadData = React.useCallback(() => {
    setLoading(true)
    const campaignParam = (campaignFilter || campaignIdFromQuery || "").trim()
    if (!campaignParam) {
      setMaterials([])
      setMaterialGifts([])
      setMaterialDeployments([])
      return getMarketingCampaigns()
        .then((camps) => setCampaigns(Array.isArray(camps) ? camps : []))
        .catch(() => setCampaigns([]))
        .finally(() => setLoading(false))
    }
    return Promise.all([
      getMarketingMaterials({ campaignId: campaignParam }),
      getMarketingCampaigns(),
      getMarketingMaterialGifts({ campaignId: campaignParam }),
      getMarketingMaterialDeployments({ campaignId: campaignParam }),
    ])
      .then(([mats, camps, gifts, deploys]) => {
        setMaterials(mats)
        setCampaigns(camps)
        setMaterialGifts(Array.isArray(gifts) ? gifts : [])
        setMaterialDeployments(Array.isArray(deploys) ? deploys : [])
      })
      .catch(() => {
        setMaterials([])
        setMaterialGifts([])
        setMaterialDeployments([])
      })
      .finally(() => setLoading(false))
  }, [campaignFilter, campaignIdFromQuery])

  const loadInquiryMaterials = React.useCallback(async () => {
    setInquiryLoading(true)
    try {
      const [mats, camps, deploys] = await Promise.all([
        getMarketingMaterials(),
        getMarketingCampaigns(),
        getMarketingMaterialDeployments(),
      ])
      setAllMaterials(mats)
      setCampaigns(camps)
      setMaterialDeployments(Array.isArray(deploys) ? deploys : [])
    } catch {
      setAllMaterials([])
      setMaterialDeployments([])
    } finally {
      setInquiryLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    if (mainTab === "overview" && materialsBrowseTab === "all") {
      void loadInquiryMaterials()
    }
  }, [mainTab, materialsBrowseTab, loadInquiryMaterials])

  React.useEffect(() => {
    if (campaignIdFromQuery) {
      setCampaignFilter(campaignIdFromQuery)
    }
  }, [campaignIdFromQuery])

  React.useEffect(() => {
    setMaterialTypeOptions(loadMarketingMaterialTypeOptions())
  }, [])

  React.useEffect(() => {
    setPlacementOptions(loadMarketingMaterialPlacementOptions())
  }, [])

  React.useEffect(() => {
    setMaterialAddForm((f) => {
      if (materialTypeOptions.some((o) => o.value === f.type)) return f
      const v = materialTypeOptions[0]?.value ?? "tentcard"
      return { ...f, type: v }
    })
  }, [materialTypeOptions])

  React.useEffect(() => {
    const vals = new Set(placementOptions.map((o) => o.value))
    setSpotFilter((f) => (f && !vals.has(f) ? "" : f))
    setInqSpotFilter((f) => (f && !vals.has(f) ? "" : f))
    setMaterialAddForm((f) => ({
      ...f,
      placementSpots: f.placementSpots.filter((s) => vals.has(s)),
    }))
  }, [placementOptions])

  const toggleMaterialAddBranch = (store: string) => {
    setMaterialAddForm((f) => ({
      ...f,
      branches: f.branches.includes(store)
        ? f.branches.filter((b) => b !== store)
        : [...f.branches, store],
    }))
  }

  const addMaterialDeploymentDraft = () => {
    const defaultSpot = placementOptions[0]?.value ?? "counter"
    setMaterialDeploymentDrafts((rows) => [
      ...rows,
      {
        storeName: stores[0] ?? "",
        placementSpot: defaultSpot,
        materialType: materialAddForm.type,
        installedOn: getBangkokDateStr(),
        removedOn: "",
        note: "",
      },
    ])
  }

  const updateMaterialDeploymentDraft = (
    idx: number,
    patch: Partial<MaterialDeploymentDraft>
  ) => {
    setMaterialDeploymentDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeMaterialDeploymentDraft = (idx: number) => {
    setMaterialDeploymentDrafts((rows) => rows.filter((_, i) => i !== idx))
  }

  const handleMaterialAddSave = async () => {
    const name = materialAddForm.name.trim()
    if (!activeCampaignId) {
      await appAlert(tr("캠페인을 먼저 선택하세요.", "Select a campaign first.", "กรุณาเลือกแคมเปญก่อน"))
      return
    }
    if (!name) {
      await appAlert(tr("홍보물 이름을 입력하세요.", "Enter a material name.", "กรุณากรอกชื่อสื่อ"))
      return
    }
    for (const row of materialDeploymentDrafts) {
      if (!row.storeName.trim() || !row.installedOn.trim()) {
        await appAlert(
          tr(
            "배치 이력 행에는 매장과 설치일이 필요합니다.",
            "Each deployment row needs store and installed date.",
            "แต่ละแถวการติดตั้งต้องมีสาขาและวันที่ติดตั้ง"
          )
        )
        return
      }
      if (!row.materialType.trim()) {
        await appAlert(
          tr(
            "각 행에서 매장 위치에 놓는 종류(홍보물 종류)를 선택하세요.",
            "Choose the material type for each store and placement row.",
            "เลือกประเภทสื่อในแต่ละแถว (สาขา·ตำแหน่ง)"
          )
        )
        return
      }
      if (row.removedOn.trim() && row.removedOn.trim() < row.installedOn.trim()) {
        await appAlert(
          tr(
            "철수일은 설치일보다 빠를 수 없습니다.",
            "Removed date cannot be earlier than installed date.",
            "วันที่เก็บออกต้องไม่เร็วกว่าวันที่ติดตั้ง"
          )
        )
        return
      }
    }
    if (
      !materialAddForm.isHqWide &&
      materialDeploymentDrafts.length === 0 &&
      materialAddForm.branches.length === 0
    ) {
      await appAlert(
        tr(
          "배포 매장을 선택하거나, 아래에서 매장·위치별 배치 행을 추가하세요.",
          "Select branch stores or add per-store placement rows below.",
          "เลือกสาขา หรือเพิ่มแถวติดตั้งรายสาขา·ตำแหน่งด้านล่าง"
        )
      )
      return
    }
    setSavingMaterialAdd(true)
    try {
      if (activeCampaign?.id && activeCampaignId === activeCampaign.id) {
        const norm = (s: string) => s.trim()
        const dDirty =
          norm(hubDesignStart) !== norm(activeCampaign.designStartDate ?? "") ||
          norm(hubDesignEnd) !== norm(activeCampaign.designEndDate ?? "")
        if (dDirty) {
          const dr = await saveMarketingCampaignDesignDates({
            campaignId: activeCampaignId,
            designStartDate: norm(hubDesignStart) || null,
            designEndDate: norm(hubDesignEnd) || null,
          })
          if (!dr.success) {
            await appAlert(dr.message || t("marketingCollabDetailSaveError"))
            return
          }
          void loadData()
          void loadInquiryMaterials()
        }
      }

      const draftBranchList = [
        ...new Set(
          materialDeploymentDrafts.map((r) => r.storeName.trim()).filter(Boolean)
        ),
      ]
      const saveBranches = materialAddForm.isHqWide
        ? []
        : materialDeploymentDrafts.length > 0
          ? draftBranchList
          : materialAddForm.branches
      const draftSpotList = [
        ...new Set(
          materialDeploymentDrafts.map((r) => (r.placementSpot || "counter").trim()).filter(Boolean)
        ),
      ]
      const savePlacementSpots =
        materialDeploymentDrafts.length > 0 ? draftSpotList : []

      const res = await saveMarketingMaterial({
        campaignId: activeCampaignId,
        type: materialAddForm.type,
        name,
        quantity: Number(materialAddForm.quantity) || 1,
        unitCost: Number(materialAddForm.unitCost) || 0,
        actualCost: Number(materialAddForm.actualCost) || 0,
        branches: saveBranches,
        isHqWide: materialAddForm.isHqWide,
        displayStartDate: materialAddForm.displayStartDate.trim() || null,
        displayEndDate: materialAddForm.displayEndDate.trim() || null,
        placementSpots: savePlacementSpots,
        status: materialAddForm.status,
        note: materialAddForm.note.trim(),
        userRole: auth?.role,
        userName: auth?.user,
        userStore: auth?.store,
      })
      if (res.success) {
        const materialId = String(res.id ?? "").trim()
        let deploymentMessage = ""
        if (materialId && materialDeploymentDrafts.length > 0) {
          const results = await Promise.all(
            materialDeploymentDrafts.map((row) =>
              saveMarketingMaterialDeployment({
                materialId,
                campaignId: activeCampaignId || null,
                storeName: row.storeName.trim(),
                placementSpot: row.placementSpot || "counter",
                materialType: row.materialType.trim(),
                installedOn: row.installedOn.trim(),
                removedOn: row.removedOn.trim() || null,
                note: row.note.trim(),
                userRole: auth?.role,
                userStore: auth?.store,
              })
            )
          )
          const failCount = results.filter((x) => !x.success).length
          if (failCount > 0) {
            deploymentMessage = tr(
              `\n\n배치 이력 ${failCount}건 저장 실패 (홍보물은 저장됨).`,
              `\n\n${failCount} deployment rows failed (material saved).`,
              `\n\nบันทึกข้อมูลการติดตั้งไม่สำเร็จ ${failCount} รายการ (บันทึกสื่อสำเร็จแล้ว)`
            )
          }
        }
        const extra = (res.expenseSyncMessage ? `\n\n${res.expenseSyncMessage}` : "") + deploymentMessage
        await appAlert(tr("저장되었습니다.", "Saved.", "บันทึกแล้ว") + extra)
        setMaterialAddForm(defaultMaterialAddForm())
        setMaterialDeploymentDrafts([])
        void loadData()
        void loadInquiryMaterials()
      } else {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingMaterialAdd(false)
    }
  }

  const campaignMap = React.useMemo(() => {
    const m: Record<string, MarketingCampaign> = {}
    campaigns.forEach((c) => {
      m[c.id] = c
    })
    return m
  }, [campaigns])

  const campaignByIdMap = React.useMemo(() => {
    const m = new Map<string, MarketingCampaign>()
    for (const c of campaigns) m.set(String(c.id), c)
    return m
  }, [campaigns])
  const activeCampaign = React.useMemo(() => {
    const cid = activeCampaignId.trim()
    return cid ? campaignByIdMap.get(cid) : undefined
  }, [activeCampaignId, campaignByIdMap])
  const todayBangkokYmd = React.useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }),
    []
  )
  const designOutOfRange = React.useMemo(() => {
    const s = (hubDesignStart.trim() || (activeCampaign?.designStartDate ?? "")).trim()
    const e = (hubDesignEnd.trim() || (activeCampaign?.designEndDate ?? "")).trim()
    if (!s || !e) return false
    return todayBangkokYmd < s || todayBangkokYmd > e
  }, [hubDesignStart, hubDesignEnd, activeCampaign, todayBangkokYmd])

  const campaignLabel = React.useCallback(
    (id: string | null | undefined) => {
      if (!id) return ""
      const c = campaignByIdMap.get(String(id))
      if (!c) return ""
      return `${c.campaignNo ? `[${c.campaignNo}] ` : ""}${c.topic}`
    },
    [campaignByIdMap]
  )

  const matchDeploymentRange = React.useCallback(
    (
      materialId: string,
      opts: {
        storeName?: string
        statusFilter: "" | "active" | "removed"
        dateFrom: string
        dateTo: string
      }
    ) => {
      const hasFilter =
        opts.statusFilter !== "" || opts.dateFrom.trim() !== "" || opts.dateTo.trim() !== ""
      if (!hasFilter) return true
      let rows = materialDeployments.filter(
        (d) => d.materialId === materialId && (!opts.storeName || d.storeName === opts.storeName)
      )
      if (opts.statusFilter === "active") {
        rows = rows.filter((d) => !(d.removedOn || "").trim())
      } else if (opts.statusFilter === "removed") {
        rows = rows.filter((d) => (d.removedOn || "").trim().length > 0)
      }
      if (rows.length === 0) return false

      const from = opts.dateFrom.trim() || "0000-01-01"
      const to = opts.dateTo.trim() || "9999-12-31"
      return rows.some((d) => {
        const start = (d.installedOn || "").trim()
        if (!start) return false
        const end = (d.removedOn || "").trim() || todayBangkokYmd
        return start <= to && end >= from
      })
    },
    [materialDeployments, todayBangkokYmd]
  )

  const filteredInquiryMaterials = React.useMemo(() => {
    let rows = allMaterials
    if (inqStoreFilter) {
      rows = rows.filter((m) => m.isHqWide || (m.branches || []).some((b) => b === inqStoreFilter))
    }
    if (inqHqFilter === "hq") {
      rows = rows.filter((m) => m.isHqWide)
    } else if (inqHqFilter === "store") {
      rows = rows.filter((m) => !m.isHqWide)
    }
    if (inqSpotFilter) {
      rows = rows.filter((m) => (m.placementSpots || []).includes(inqSpotFilter))
    }
    const q = inqSearch.trim().toLowerCase()
    if (q) {
      rows = rows.filter((m) => {
        const camp = m.campaignId ? campaignByIdMap.get(String(m.campaignId)) : undefined
        const blob = [m.name, m.type, m.campaignNo, m.note, camp?.topic, camp?.campaignNo]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return blob.includes(q)
      })
    }
    if (inqMatStatus) {
      rows = rows.filter((m) => m.status === inqMatStatus)
    }
    rows = rows.filter((m) =>
      matchDeploymentRange(m.id, {
        storeName: inqStoreFilter || undefined,
        statusFilter: inqDepStatusFilter,
        dateFrom: inqDepDateFrom,
        dateTo: inqDepDateTo,
      })
    )
    return rows
  }, [
    allMaterials,
    inqSearch,
    inqMatStatus,
    inqStoreFilter,
    inqHqFilter,
    inqSpotFilter,
    inqDepStatusFilter,
    inqDepDateFrom,
    inqDepDateTo,
    campaignByIdMap,
    matchDeploymentRange,
  ])

  const openMaterialByCampaignTab = (m: MarketingMaterial) => {
    setMaterialsBrowseTab("browse")
    if (m.campaignId) setCampaignFilter(String(m.campaignId))
  }

  const handleDeleteInquiryMaterial = async (m: MarketingMaterial) => {
    if (
      !(await appConfirm(
        tr(`「${m.name}」 홍보물을 삭제할까요?`, `Delete material “${m.name}”?`, `ลบสื่อ “${m.name}”?`)
      ))
    )
      return
    const res = await deleteMarketingMaterial({ id: m.id })
    if (res.success) {
      void loadInquiryMaterials()
      void loadData()
    } else {
      await appAlert(res.message || tr("삭제 실패", "Delete failed", "ลบไม่สำเร็จ"))
    }
  }

  const filteredMaterials = React.useMemo(() => {
    let list = materials
    if (storeFilter) {
      list = list.filter((m) =>
        m.isHqWide || (m.branches || []).some((b) => b === storeFilter)
      )
    }
    if (hqFilter === "hq") {
      list = list.filter((m) => m.isHqWide)
    } else if (hqFilter === "store") {
      list = list.filter((m) => !m.isHqWide)
    }
    if (spotFilter) {
      list = list.filter((m) => (m.placementSpots || []).includes(spotFilter))
    }
    if (campaignFilter) {
      list = list.filter((m) => m.campaignId === campaignFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (m) =>
          (m.name || "").toLowerCase().includes(q) ||
          (m.type || "").toLowerCase().includes(q) ||
          (m.campaignNo || "").toLowerCase().includes(q)
      )
    }
    list = list.filter((m) =>
      matchDeploymentRange(m.id, {
        storeName: storeFilter || undefined,
        statusFilter: depStatusFilter,
        dateFrom: depDateFrom,
        dateTo: depDateTo,
      })
    )
    return list
  }, [
    materials,
    storeFilter,
    hqFilter,
    spotFilter,
    campaignFilter,
    searchQuery,
    depStatusFilter,
    depDateFrom,
    depDateTo,
    matchDeploymentRange,
  ])

  const materialsGroupedByType = React.useMemo(() => {
    const groups = new Map<string, MarketingMaterial[]>()
    for (const mat of filteredMaterials) {
      const k = (mat.type || "other").trim() || "other"
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(mat)
    }
    const locale = lang === "ko" ? "ko" : lang === "th" ? "th" : "en"
    const typeKeys = Array.from(groups.keys()).sort((a, b) =>
      materialTypeLabel(a).localeCompare(materialTypeLabel(b), locale)
    )
    return typeKeys.map((typeKey) => ({
      typeKey,
      items: (groups.get(typeKey) || []).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", locale)
      ),
    }))
  }, [filteredMaterials, materialTypeLabel, lang])

  const hqLabel = tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")

  const sumGiftQty = React.useCallback((rows: MarketingMaterialGift[]) => {
    return rows.reduce(
      (a, g) => {
        const rem = Math.max(0, Math.floor(g.allocatedQty) - Math.floor(g.distributedQty))
        return {
          alloc: a.alloc + g.allocatedQty,
          dist: a.dist + g.distributedQty,
          rem: a.rem + rem,
        }
      },
      { alloc: 0, dist: 0, rem: 0 }
    )
  }, [])

  const giftsForDisplay = React.useCallback(
    (mat: MarketingMaterial, storeBucket: string) => {
      const isHqBucket = mat.isHqWide && storeBucket === hqLabel
      return materialGifts.filter((g) => {
        if (g.materialId !== mat.id) return false
        if (isHqBucket) return true
        if (storeFilter && g.storeName !== storeFilter) return false
        return g.storeName === storeBucket
      })
    },
    [materialGifts, hqLabel, storeFilter]
  )

  const giftsForMaterialRow = React.useCallback(
    (mat: MarketingMaterial) => {
      return materialGifts.filter((g) => {
        if (g.materialId !== mat.id) return false
        if (!storeFilter) return true
        if (mat.isHqWide) return true
        return g.storeName === storeFilter
      })
    },
    [materialGifts, storeFilter]
  )

  const deploymentRowsForMaterial = React.useCallback(
    (materialId: string, storeName?: string) => {
      return materialDeployments
        .filter((d) => d.materialId === materialId && (!storeName || d.storeName === storeName))
        .sort((a, b) => (b.installedOn || "").localeCompare(a.installedOn || ""))
    },
    [materialDeployments]
  )

  const toggleDeploymentEditor = React.useCallback((key: string) => {
    setOpenDeploymentEditorKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const refreshMaterialDeployments = React.useCallback(() => {
    void loadData()
    void loadInquiryMaterials()
  }, [loadData, loadInquiryMaterials])

  const byStore = React.useMemo(() => {
    const map: Record<string, { material: MarketingMaterial; campaign: MarketingCampaign | undefined }[]> = {}
    for (const mat of filteredMaterials) {
      const campaign = mat.campaignId ? campaignMap[mat.campaignId] : undefined
      const branches = mat.isHqWide
        ? [hqLabel]
        : mat.branches && mat.branches.length > 0
          ? mat.branches
          : [tr("미지정", "Unassigned", "ยังไม่ระบุ")]
      for (const branch of branches) {
        if (!map[branch]) map[branch] = []
        map[branch].push({ material: mat, campaign })
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredMaterials, campaignMap, tr, hqLabel])

  const todayBangkok = getBangkokDateStr()
  const cutoffDate = addDaysYmd(todayBangkok, -30)

  const isLongInstalled = React.useCallback(
    (endDate: string | null | undefined) => {
      if (!endDate || !endDate.trim()) return false
      return endDate < cutoffDate
    },
    [cutoffDate]
  )

  return (
    <MarketingPageShell>
        <MarketingPageHero icon={Package} title={t("adminMarketingMaterials")} description={t("marketingHeroDescMaterials")} />
        <div className="mb-4 flex rounded-lg border border-input bg-muted/30 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setMainTab("overview")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md py-2.5 transition-colors",
              mainTab === "overview"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tr("홍보물 현황", "Materials overview", "ภาพรวมสื่อ")}
          </button>
          <button
            type="button"
            onClick={() => setMainTab("gifts")}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md py-2.5 transition-colors",
              mainTab === "gifts"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("adminMarketingMaterialGifts") || tr("사은품", "Gifts", "ของแถม")}
          </button>
        </div>

        {mainTab === "gifts" ? (
          campaignFilter || campaignIdFromQuery ? (
            <MarketingMaterialGiftsPanel
              syncCampaignId={campaignFilter || campaignIdFromQuery}
              showPageHeader={false}
            />
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
              {tr("사은품을 보려면 캠페인을 선택하세요.", "Select a campaign to manage gifts.", "เลือกแคมเปญเพื่อจัดการของแถม")}
            </div>
          )
        ) : (
          <Tabs
            value={materialsBrowseTab}
            onValueChange={(v) => setMaterialsBrowseTab(v as MaterialsBrowseTab)}
            className={adminTabsRootCn}
          >
            <div className={cn(adminTabsBarCn, "px-0 pb-2")}>
              <div className={adminTabsScrollCn}>
                <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="register" className={adminTabsTriggerCn}>
                    {t("marketingMaterialsSubtabRegister")}
                  </TabsTrigger>
                  <TabsTrigger value="browse" className={adminTabsTriggerCn}>
                    {t("marketingMaterialsSubtabBrowse")}
                  </TabsTrigger>
                  <TabsTrigger value="all" className={adminTabsTriggerCn}>
                    {t("marketingMaterialsSubtabInquiry")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
            <TabsContent value="register" className={cn(adminTabsContentCn, "space-y-0")}>
        <MarketingHubCampaignContextStrip
          value={campaignFilter}
          onChange={setCampaignFilter}
          campaigns={campaigns}
          allowEmpty
          emptyOptionLabel={tr("캠페인 선택…", "Select campaign…", "เลือกแคมเปญ…")}
          onRefresh={async () => {
            await loadData()
            await loadInquiryMaterials()
          }}
          maxListHeightClass="max-h-52"
          disabled={loading}
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={() => {
              void loadData()
              void loadInquiryMaterials()
            }}
            disabled={loading}
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            disabled={!activeCampaignId || loading}
            title={tr("입력란을 비우고 새로 입력합니다.", "Clear the form for a new entry.", "ล้างฟอร์มเพื่อกรอกใหม่")}
            onClick={() => {
              setMaterialAddForm(defaultMaterialAddForm())
              setMaterialDeploymentDrafts([])
            }}
          >
            <Plus className="h-4 w-4" />
            {tr("입력란 초기화", "Clear form", "ล้างฟอร์ม")}
          </Button>
          <p className="min-w-[min(100%,18rem)] flex-1 text-xs text-muted-foreground">
            {tr(
              "목록·필터·배치 이력 편집은 「캠페인별 조회」 탭에서 하세요.",
              "Use the “Campaign browse” tab for lists, filters, and deployment edits.",
              "ดูรายการ ตัวกรอง และแก้ไขการติดตั้งในแท็บ “ดูตามแคมเปญ”"
            )}
          </p>
        </div>
        {!activeCampaignId && (
          <p className="mb-4 rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {tr(
              "캠페인을 선택하면 아래에 홍보물 등록 양식이 표시됩니다.",
              "Select a campaign to show the registration form below.",
              "เลือกแคมเปญเพื่อแสดงฟอร์มลงทะเบียนสื่อด้านล่าง"
            )}
          </p>
        )}

        {activeCampaignId && (
          <Card className="mb-4 overflow-hidden border-primary/15 shadow-md ring-1 ring-primary/5">
            <CardHeader className="border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Pencil className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base">
                    {tr("홍보물 등록", "Register material", "ลงทะเบียนสื่อ")}
                  </CardTitle>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 self-end sm:self-auto"
                  onClick={() => setMaterialPicklistsDialogOpen(true)}
                >
                  <Settings2 className="h-4 w-4" />
                  {tr("선택지 편집", "Edit picklists", "แก้ไขตัวเลือก")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
            <MarketingLinkedCampaignStrip
              label={t("marketingAdsOptionsLinkedCampaign")}
              title={campaignLabel(activeCampaignId) || activeCampaignId}
            />
            <MarketingHubRecordScheduleCard
              disabled={savingMaterialAdd}
              designOutOfRange={designOutOfRange}
              campaignId={activeCampaignId}
              hubDesignStartDate={hubDesignStart}
              hubDesignEndDate={hubDesignEnd}
              onHubDesignStartDateChange={setHubDesignStart}
              onHubDesignEndDateChange={setHubDesignEnd}
              inputVariant="compact"
              executionTitle={t("marketingRecordDisplayWindowTitle")}
              executionFromLabel={t("marketingRecordPeriodFrom")}
              executionToLabel={t("marketingRecordPeriodTo")}
              executionFromValue={materialAddForm.displayStartDate}
              executionToValue={materialAddForm.displayEndDate}
              onExecutionFromChange={(v) => setMaterialAddForm((f) => ({ ...f, displayStartDate: v }))}
              onExecutionToChange={(v) => setMaterialAddForm((f) => ({ ...f, displayEndDate: v }))}
            />
            {designOutOfRange ? (
              <p className="mb-3 text-[11px] text-amber-700 dark:text-amber-300">{t("marketingDesignTodayOutsidePeriod")}</p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] text-muted-foreground">
                  {tr("대표 종류(기본값)", "Primary type (default)", "ประเภทหลัก (ค่าเริ่มต้น)")}
                </label>
                <select
                  value={materialAddForm.type}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, type: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {materialTypeSelectOptions(materialTypeOptions, materialAddForm.type, tr).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {tr(
                    "실제 매장·위치별 종류는 아래 배치 행에서 각각 선택합니다.",
                    "Pick the type per store and placement in the rows below.",
                    "เลือกประเภทต่อสาขา·ตำแหน่งในแถวด้านล่าง"
                  )}
                </p>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("상태", "Status", "สถานะ")}</label>
                <select
                  value={materialAddForm.status}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, status: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {MATERIAL_STATUS_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {materialStatusLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("이름/설명 *", "Name *", "ชื่อ *")}</label>
                <Input
                  value={materialAddForm.name}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 h-9"
                  placeholder={tr("예: 여름 시즌 스탠디", "e.g. Summer standee", "เช่น สแตนดี้ซัมเมอร์")}
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("수량", "Qty", "จำนวน")}</label>
                <Input
                  type="number"
                  min={1}
                  value={materialAddForm.quantity}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">{tr("단가 (฿)", "Unit (฿)", "ราคาต่อหน่วย (฿)")}</label>
                <Input
                  type="number"
                  min={0}
                  value={materialAddForm.unitCost}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, unitCost: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">
                  {tr("실제 비용 (฿)", "Actual cost (฿)", "ค่าใช้จ่ายจริง (฿)")}
                </label>
                <Input
                  type="number"
                  min={0}
                  value={materialAddForm.actualCost}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, actualCost: e.target.value }))}
                  className="mt-1 h-9"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {tr(
                    "본사 권한이면 지출관리 지급예정에 연동됩니다.",
                    "Office role: links to expense planned payments.",
                    "สิทธิ์สำนักงาน: เชื่อมค่าใช้จ่ายที่กำหนดจ่าย"
                  )}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={materialAddForm.isHqWide}
                    onCheckedChange={(v) =>
                      setMaterialAddForm((f) => ({ ...f, isHqWide: v === true }))
                    }
                  />
                  {tr("본사 공용 홍보물", "HQ-wide material", "สื่อส่วนกลางสำนักงานใหญ่")}
                </label>
              </div>
              {!materialAddForm.isHqWide && stores.length > 0 && materialDeploymentDrafts.length === 0 && (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-[10px] text-muted-foreground">{tr("배포 매장", "Branches", "สาขา")}</p>
                  <div className="flex flex-wrap gap-2">
                    {stores.map((store) => (
                      <label key={store} className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={materialAddForm.branches.includes(store)}
                          onCheckedChange={() => toggleMaterialAddBranch(store)}
                        />
                        {formatStoreLabel(store)}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {tr(
                      "아래에 배치 행을 쓰면 배포 매장은 행의 매장 선택으로 자동 정해집니다.",
                      "If you add placement rows below, branch list is taken from those rows.",
                      "หากเพิ่มแถวติดตั้งด้านล่าง สาขาจะถูกกำหนดจากแถวนั้น"
                    )}
                  </p>
                </div>
              )}
              {!materialAddForm.isHqWide && materialDeploymentDrafts.length > 0 && (
                <div className="sm:col-span-2 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                  {tr(
                    "배포 매장은 아래 배치 행에 선택한 매장으로 저장됩니다.",
                    "Branch list is saved from the stores selected in the rows below.",
                    "สาขาจะถูกบันทึกจากแถวติดตั้งด้านล่าง"
                  )}
                </div>
              )}
              <div className="sm:col-span-2 rounded-lg border border-dashed p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {tr(
                      "매장·위치별 종류 및 설치",
                      "Store, placement & type",
                      "สาขา·ตำแหน่ง·ประเภท และติดตั้ง"
                    )}
                  </p>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={addMaterialDeploymentDraft}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {tr("행 추가", "Add row", "เพิ่มแถว")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {materialDeploymentDrafts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {tr(
                        "행을 추가해 매장·매장 위치·종류(필수)·설치일을 입력하세요. 배치 행이 없으면 위에서 배포 매장만 선택해 저장할 수 있습니다.",
                        "Add rows: store, placement, type (required), installed date. Without rows you can still save using branch checkboxes only.",
                        "เพิ่มแถว: สาขา ตำแหน่ง ประเภท (จำเป็น) วันติดตั้ง — หรือเลือกสาขาด้านบนอย่างเดียว"
                      )}
                    </p>
                  ) : (
                    materialDeploymentDrafts.map((row, idx) => (
                      <div key={idx} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
                        <div className="sm:col-span-3">
                          <label className="text-[10px] text-muted-foreground">{tr("매장", "Store", "สาขา")}</label>
                          <select
                            value={row.storeName}
                            onChange={(e) => updateMaterialDeploymentDraft(idx, { storeName: e.target.value })}
                            className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="">{tr("선택", "Select", "เลือก")}</option>
                            {stores.map((s) => (
                              <option key={s} value={s}>
                                {formatStoreLabel(s)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-muted-foreground">{tr("위치", "Placement", "ตำแหน่ง")}</label>
                          <select
                            value={row.placementSpot}
                            onChange={(e) => updateMaterialDeploymentDraft(idx, { placementSpot: e.target.value })}
                            className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {placementOptions.map((spot) => (
                              <option key={spot.value} value={spot.value}>
                                {materialPlacementSpotLabel(spot.value)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-muted-foreground">{tr("설치일", "Installed", "ติดตั้ง")}</label>
                          <Input
                            type="date"
                            value={row.installedOn}
                            onChange={(e) => updateMaterialDeploymentDraft(idx, { installedOn: e.target.value })}
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-muted-foreground">{tr("철수일", "Removed", "เก็บออก")}</label>
                          <Input
                            type="date"
                            value={row.removedOn}
                            onChange={(e) => updateMaterialDeploymentDraft(idx, { removedOn: e.target.value })}
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-[10px] text-muted-foreground">{tr("종류 *", "Type *", "ประเภท *")}</label>
                          <select
                            value={row.materialType}
                            onChange={(e) => updateMaterialDeploymentDraft(idx, { materialType: e.target.value })}
                            className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {materialTypeSelectOptions(materialTypeOptions, row.materialType || materialAddForm.type, tr).map(
                              (o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                        <div className="sm:col-span-1 flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-full text-destructive hover:text-destructive"
                            onClick={() => removeMaterialDeploymentDraft(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="sm:col-span-12">
                          <Input
                            value={row.note}
                            onChange={(e) => updateMaterialDeploymentDraft(idx, { note: e.target.value })}
                            className="h-8 text-xs"
                            placeholder={tr("배치 메모(선택)", "Deployment note (optional)", "หมายเหตุการติดตั้ง (ไม่บังคับ)")}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("메모", "Note", "บันทึก")}</label>
                <Input
                  value={materialAddForm.note}
                  onChange={(e) => setMaterialAddForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void handleMaterialAddSave()} disabled={savingMaterialAdd}>
                {savingMaterialAdd ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                {tr("저장", "Save", "บันทึก")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMaterialAddForm(defaultMaterialAddForm())
                  setMaterialDeploymentDrafts([])
                }}
              >
                {tr("입력란 비우기", "Reset fields", "ล้างช่อง")}
              </Button>
            </div>
            </CardContent>
          </Card>
        )}
            </TabsContent>
            <TabsContent value="browse" className={cn(adminTabsContentCn, "space-y-0")}>
        <MarketingHubCampaignContextStrip
          value={campaignFilter}
          onChange={setCampaignFilter}
          campaigns={campaigns}
          allowEmpty
          emptyOptionLabel={tr("캠페인 선택…", "Select campaign…", "เลือกแคมเปญ…")}
          onRefresh={async () => {
            await loadData()
            await loadInquiryMaterials()
          }}
          maxListHeightClass="max-h-52"
          disabled={loading}
        />
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              onClick={() => {
                void loadData()
                void loadInquiryMaterials()
              }}
              disabled={loading}
            >
              <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {t("posRefresh") || "새로고침"}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              disabled={!activeCampaignId || loading}
              title={tr("입력란을 비우고 새로 입력합니다.", "Clear the form for a new entry.", "ล้างฟอร์มเพื่อกรอกใหม่")}
              onClick={() => {
                setMaterialAddForm(defaultMaterialAddForm())
                setMaterialDeploymentDrafts([])
              }}
            >
              <Plus className="h-4 w-4" />
              {tr("입력란 초기화", "Clear form", "ล้างฟอร์ม")}
            </Button>

            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{tr("전체 매장", "All Stores", "ทุกสาขา")}</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {formatStoreLabel(s)}
                </option>
              ))}
            </select>

            <select
              value={hqFilter}
              onChange={(e) => setHqFilter(e.target.value as "" | "hq" | "store")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{tr("본사/매장 전체", "HQ/Store All", "ทั้งหมด (สำนักงานใหญ่/สาขา)")}</option>
              <option value="hq">{tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}</option>
              <option value="store">{tr("매장별 운영", "Store-based", "ตามสาขา")}</option>
            </select>

            <select
              value={spotFilter}
              onChange={(e) => setSpotFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{tr("매장 위치 전체", "All Placements", "ตำแหน่งทั้งหมด")}</option>
              {placementOptions.map((spot) => (
                <option key={spot.value} value={spot.value}>
                  {materialPlacementSpotLabel(spot.value)}
                </option>
              ))}
            </select>

            <select
              value={depStatusFilter}
              onChange={(e) => setDepStatusFilter(e.target.value as "" | "active" | "removed")}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{tr("배치 상태 전체", "All deployment status", "สถานะการติดตั้งทั้งหมด")}</option>
              <option value="active">{tr("설치중", "Active", "กำลังติดตั้ง")}</option>
              <option value="removed">{tr("철수완료", "Removed", "เก็บออกแล้ว")}</option>
            </select>

            <Input
              type="date"
              value={depDateFrom}
              onChange={(e) => setDepDateFrom(e.target.value)}
              className="h-10 w-40"
              title={tr("배치 기간 시작", "Deployment from", "วันที่เริ่มช่วงติดตั้ง")}
            />
            <Input
              type="date"
              value={depDateTo}
              onChange={(e) => setDepDateTo(e.target.value)}
              className="h-10 w-40"
              title={tr("배치 기간 종료", "Deployment to", "วันที่สิ้นสุดช่วงติดตั้ง")}
            />

            <Input
              placeholder={tr("홍보물명 검색", "Search material name", "ค้นหาชื่อสื่อ")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-48"
            />
          </div>

          <div className="ml-2 flex rounded-md border border-input p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("store")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded px-3 text-sm",
                viewMode === "store"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Store className="h-4 w-4" />
              {tr("매장별", "By Store", "ตามสาขา")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("material")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded px-3 text-sm",
                viewMode === "material"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              {tr("홍보물별", "By Material", "ตามสื่อ")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {viewMode === "store"
              ? tr(
                  "매장(또는 본사공용) 기준으로 묶습니다. 한 홍보물이 여러 매장에 배포되면 행이 매장 수만큼 반복됩니다.",
                  "Grouped by store (or HQ-wide). A material assigned to multiple stores appears once per store row.",
                  "จัดกลุ่มตามสาขา (หรือส่วนกลาง) — หากสื่อหนึ่งชิ้นอยู่หลายสาขา จะแสดงหลายแถว",
                )
              : tr(
                  "홍보물당 한 줄로 보고, 아래는 종류별 섹션으로 나눕니다.",
                  "One row per material, grouped below by type.",
                  "หนึ่งแถวต่อหนึ่งสื่อ จัดกลุ่มตามประเภทด้านล่าง",
                )}
          </p>
        </div>

        {campaignIdFromQuery && (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            {tr("캠페인 허브에서 전달된 항목으로 필터되었습니다.", "Filtered by campaign from hub.", "กรองตามแคมเปญจากฮับ")}
          </div>
        )}

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="space-y-4">
          {viewMode === "store" && (
            <div className="space-y-4">
              {byStore.length === 0 && !loading && (
                <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  {!(campaignFilter || campaignIdFromQuery)
                    ? tr("캠페인을 선택하면 홍보물이 표시됩니다.", "Select a campaign to view materials.", "เลือกแคมเปญเพื่อดูสื่อ")
                    : tr("등록된 홍보물이 없습니다.", "No materials registered.", "ไม่มีสื่อที่ลงทะเบียน")}
                </p>
              )}
              {byStore.map(([storeName, items]) => (
                <div
                  key={storeName}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">
                    {storeName}
                  </div>
                  <div className="divide-y">
                    {items.map(({ material, campaign }) => {
                      const giftRows = giftsForDisplay(material, storeName)
                      const giftSum = giftRows.length > 0 ? sumGiftQty(giftRows) : null
                      const deploymentRows = deploymentRowsForMaterial(material.id, storeName).slice(0, 2)
                      const deploymentEditorKey = `store:${material.id}:${storeName}`
                      const isDeploymentEditorOpen = openDeploymentEditorKeys.has(deploymentEditorKey)
                      return (
                      <div
                        key={`${storeName}-${material.id}`}
                        className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{material.name}</span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                MATERIAL_STATUS_COLORS[material.status] ||
                                  "bg-gray-100 text-gray-700"
                              )}
                            >
                              {materialStatusLabel(material.status)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {materialTypeLabel(material.type)}
                            </span>
                            {material.isHqWide && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                                {tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}
                              </span>
                            )}
                            {campaign &&
                              isLongInstalled(material.displayEndDate || campaign.endDate) && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  {tr("오래 설치됨", "Long installed", "ติดตั้งมานาน")}
                                </span>
                              )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            <span>
                              {tr("수량", "Qty", "จำนวน")}: {material.quantity}
                            </span>
                            {campaign && (
                              <>
                                <span className="font-mono text-[10px] text-foreground">
                                  {material.campaignNo?.trim() || campaign.campaignNo
                                    ? `[${material.campaignNo?.trim() || campaign.campaignNo}] `
                                    : ""}
                                  {campaign.topic}
                                </span>
                                <span>
                                  {material.displayStartDate || campaign.startDate || "-"} ~{" "}
                                  {material.displayEndDate || campaign.endDate || "-"}
                                </span>
                              </>
                            )}
                            {material.placementSpots && material.placementSpots.length > 0 && (
                              <span>
                                {tr("위치", "Placement", "ตำแหน่ง")}:{" "}
                                {material.placementSpots.map((spot) => materialPlacementSpotLabel(spot)).join(", ")}
                              </span>
                            )}
                            {deploymentRows.length > 0 && (
                              <span>
                                {tr("배치", "Deployment", "การติดตั้ง")}:{" "}
                                {deploymentRows
                                  .map((d) => formatDeploymentPeriod(d.installedOn, d.removedOn))
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                            {giftSum && (
                              <span>
                                {tr("사은품", "Gifts", "ของแถม")}: {tr("배정", "Alloc", "จัดสรร")}{" "}
                                {giftSum.alloc} · {tr("배포", "Dist", "แจกจ่าย")} {giftSum.dist} ·{" "}
                                {tr("잔여", "Left", "คงเหลือ")} {giftSum.rem}
                              </span>
                            )}
                          </div>
                        </div>
                        {material.campaignId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 gap-1 text-xs"
                            onClick={() =>
                              router.push(
                                `/admin/marketing/campaigns?openCampaign=${material.campaignId}&tab=materials`
                              )
                            }
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {tr("캠페인에서 수정", "Edit in Campaign", "แก้ไขในแคมเปญ")}
                          </Button>
                        )}
                        <div className="w-full">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`${ADMIN_BTN_XS_CN} px-0 text-xs text-muted-foreground hover:text-foreground`}
                            onClick={() => toggleDeploymentEditor(deploymentEditorKey)}
                          >
                            {isDeploymentEditorOpen
                              ? tr("배치 이력 닫기", "Hide deployments", "ซ่อนรายการติดตั้ง")
                              : tr("배치 이력 편집", "Edit deployments", "แก้ไขการติดตั้ง")}
                          </Button>
                          {isDeploymentEditorOpen && (
                            <MarketingMaterialDeploymentEditor
                              materialId={material.id}
                              campaignId={material.campaignId}
                              materialType={material.type}
                              stores={stores}
                              deployments={deploymentRowsForMaterial(material.id, storeName)}
                              placementOptions={placementOptions}
                              materialTypeOptions={materialTypeOptions}
                              tr={tr}
                              onSaved={refreshMaterialDeployments}
                            />
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === "material" && (
            <div className="space-y-4">
              {filteredMaterials.length === 0 && !loading && (
                <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  {!(campaignFilter || campaignIdFromQuery)
                    ? tr("캠페인을 선택하면 홍보물이 표시됩니다.", "Select a campaign to view materials.", "เลือกแคมเปญเพื่อดูสื่อ")
                    : tr("등록된 홍보물이 없습니다.", "No materials registered.", "ไม่มีสื่อที่ลงทะเบียน")}
                </p>
              )}
              {materialsGroupedByType.map(({ typeKey, items }) => (
                <div key={typeKey} className="overflow-hidden rounded-xl border bg-card">
                  <div className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold">
                    {materialTypeLabel(typeKey)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({items.length})
                    </span>
                  </div>
                  <div className="divide-y">
                    {items.map((mat) => {
                      const campaign = mat.campaignId ? campaignMap[mat.campaignId] : undefined
                      const giftRowsMat = giftsForMaterialRow(mat)
                      const giftSumMat = giftRowsMat.length > 0 ? sumGiftQty(giftRowsMat) : null
                      const deploymentRowsMat = deploymentRowsForMaterial(mat.id).slice(0, 2)
                      const deploymentEditorKey = `material:${mat.id}`
                      const isDeploymentEditorOpen = openDeploymentEditorKeys.has(deploymentEditorKey)
                      return (
                        <div
                          key={mat.id}
                          className="flex flex-wrap items-start justify-between gap-2 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{mat.name}</span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  MATERIAL_STATUS_COLORS[mat.status] || "bg-gray-100 text-gray-700"
                                )}
                              >
                                {materialStatusLabel(mat.status)}
                              </span>
                              {mat.isHqWide && (
                                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                                  {tr("본사공용", "HQ-wide", "ส่วนกลางสำนักงานใหญ่")}
                                </span>
                              )}
                              {campaign && isLongInstalled(mat.displayEndDate || campaign.endDate) && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  {tr("오래 설치됨", "Long installed", "ติดตั้งมานาน")}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              <span>
                                {tr("수량", "Qty", "จำนวน")}: {mat.quantity}
                              </span>
                              {mat.branches && mat.branches.length > 0 && (
                                <span>
                                  {tr("매장", "Stores", "สาขา")}: {mat.branches.join(", ")}
                                </span>
                              )}
                              {mat.placementSpots && mat.placementSpots.length > 0 && (
                                <span>
                                  {tr("위치", "Placement", "ตำแหน่ง")}:{" "}
                                  {mat.placementSpots.map((spot) => materialPlacementSpotLabel(spot)).join(", ")}
                                </span>
                              )}
                              {deploymentRowsMat.length > 0 && (
                                <span>
                                  {tr("배치", "Deployment", "การติดตั้ง")}:{" "}
                                  {deploymentRowsMat
                                    .map(
                                      (d) =>
                                        `${d.storeName}(${formatDeploymentPeriod(d.installedOn, d.removedOn)})`
                                    )
                                    .join(" · ")}
                                </span>
                              )}
                              {campaign && (
                                <>
                                  <span className="font-mono text-[10px] text-foreground">
                                    {mat.campaignNo?.trim() || campaign.campaignNo
                                      ? `[${mat.campaignNo?.trim() || campaign.campaignNo}] `
                                      : ""}
                                    {campaign.topic}
                                  </span>
                                  <span>
                                    {mat.displayStartDate || campaign.startDate || "-"} ~{" "}
                                    {mat.displayEndDate || campaign.endDate || "-"}
                                  </span>
                                </>
                              )}
                              {giftSumMat && (
                                <span>
                                  {tr("사은품", "Gifts", "ของแถม")}: {tr("배정", "Alloc", "จัดสรร")}{" "}
                                  {giftSumMat.alloc} · {tr("배포", "Dist", "แจกจ่าย")} {giftSumMat.dist} ·{" "}
                                  {tr("잔여", "Left", "คงเหลือ")} {giftSumMat.rem}
                                </span>
                              )}
                            </div>
                          </div>
                          {mat.campaignId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0 gap-1 text-xs"
                              onClick={() =>
                                router.push(
                                  `/admin/marketing/campaigns?openCampaign=${mat.campaignId}&tab=materials`
                                )
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {tr("캠페인에서 수정", "Edit in Campaign", "แก้ไขในแคมเปญ")}
                            </Button>
                          )}
                          <div className="w-full">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={`${ADMIN_BTN_XS_CN} px-0 text-xs text-muted-foreground hover:text-foreground`}
                              onClick={() => toggleDeploymentEditor(deploymentEditorKey)}
                            >
                              {isDeploymentEditorOpen
                                ? tr("배치 이력 닫기", "Hide deployments", "ซ่อนรายการติดตั้ง")
                                : tr("배치 이력 편집", "Edit deployments", "แก้ไขการติดตั้ง")}
                            </Button>
                            {isDeploymentEditorOpen && (
                              <MarketingMaterialDeploymentEditor
                                materialId={mat.id}
                                campaignId={mat.campaignId}
                                materialType={mat.type}
                                stores={stores}
                                deployments={deploymentRowsForMaterial(mat.id)}
                                placementOptions={placementOptions}
                                materialTypeOptions={materialTypeOptions}
                                tr={tr}
                                onSaved={refreshMaterialDeployments}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
            </TabsContent>
            <TabsContent value="all" className={adminTabsContentCn}>
              <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {tr(
                  "전체 홍보물을 매장·위치·상태로 좁혀 조회합니다. 수정은 캠페인 허브에서 하거나 아래에서 캠페인별 탭으로 이동하세요.",
                  "Browse all materials by store, placement, and status. Edit in Campaign Hub or switch to the campaign tab below.",
                  "ดูสื่อทั้งหมดตามสาขา ตำแหน่ง และสถานะ — แก้ไขในศูนย์แคมเปญหรือไปแท็บตามแคมเปญ"
                )}
              </div>
              <div className="mb-4 flex flex-wrap items-end gap-2">
                <div className="flex min-w-[140px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tr("매장", "Store", "สาขา")}
                  </label>
                  <select
                    value={inqStoreFilter}
                    onChange={(e) => setInqStoreFilter(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{tr("전체 매장", "All Stores", "ทุกสาขา")}</option>
                    {stores.map((s) => (
                      <option key={s} value={s}>
                        {formatStoreLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex min-w-[160px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tr("본사/매장", "HQ / store", "สำนักงานใหญ่/สาขา")}
                  </label>
                  <select
                    value={inqHqFilter}
                    onChange={(e) => setInqHqFilter(e.target.value as "" | "hq" | "store")}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{tr("본사/매장 전체", "HQ/Store All", "ทั้งหมด (สำนักงานใหญ่/สาขา)")}</option>
                    <option value="hq">{hqLabel}</option>
                    <option value="store">{tr("매장별 운영", "Store-based", "ตามสาขา")}</option>
                  </select>
                </div>
                <div className="flex min-w-[140px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tr("매장 위치", "Placement", "ตำแหน่ง")}
                  </label>
                  <select
                    value={inqSpotFilter}
                    onChange={(e) => setInqSpotFilter(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{tr("매장 위치 전체", "All Placements", "ตำแหน่งทั้งหมด")}</option>
                    {placementOptions.map((spot) => (
                      <option key={spot.value} value={spot.value}>
                        {materialPlacementSpotLabel(spot.value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex min-w-[160px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tr("배치 상태", "Deployment status", "สถานะการติดตั้ง")}
                  </label>
                  <select
                    value={inqDepStatusFilter}
                    onChange={(e) =>
                      setInqDepStatusFilter(e.target.value as "" | "active" | "removed")
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{tr("전체", "All", "ทั้งหมด")}</option>
                    <option value="active">{tr("설치중", "Active", "กำลังติดตั้ง")}</option>
                    <option value="removed">{tr("철수완료", "Removed", "เก็บออกแล้ว")}</option>
                  </select>
                </div>
                <div className="flex min-w-[170px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tr("배치 기간 시작", "Deployment from", "เริ่มช่วงติดตั้ง")}
                  </label>
                  <Input
                    type="date"
                    value={inqDepDateFrom}
                    onChange={(e) => setInqDepDateFrom(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex min-w-[170px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tr("배치 기간 종료", "Deployment to", "สิ้นสุดช่วงติดตั้ง")}
                  </label>
                  <Input
                    type="date"
                    value={inqDepDateTo}
                    onChange={(e) => setInqDepDateTo(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex min-w-[140px] flex-col gap-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("marketingMaterialsFilterMaterialStatus")}
                  </label>
                  <select
                    value={inqMatStatus}
                    onChange={(e) => setInqMatStatus(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("all")}</option>
                    {MATERIAL_STATUS_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {materialStatusLabel(v)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[200px] flex-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("search")}
                  </label>
                  <Input
                    className="mt-1 h-10"
                    value={inqSearch}
                    onChange={(e) => setInqSearch(e.target.value)}
                    placeholder={tr(
                      "이름·유형·캠페인번호·비고 검색…",
                      "Search name, type, campaign no., note…",
                      "ค้นหาชื่อ ประเภท รหัสแคมเปญ บันทึก…"
                    )}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={() => void loadInquiryMaterials()}
                  disabled={inquiryLoading}
                >
                  <RotateCw className={cn("h-4 w-4", inquiryLoading && "animate-spin")} />
                  {t("posRefresh") || "새로고침"}
                </Button>
              </div>
              {inquiryLoading && (
                <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t("loading")}
                </div>
              )}
              <div className="rounded-xl border bg-card">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">
                    {t("marketingMaterialsSubtabInquiry")} ({filteredInquiryMaterials.length})
                  </h3>
                </div>
                <div className="divide-y overflow-x-auto">
                  {!inquiryLoading && filteredInquiryMaterials.length === 0 && (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {t("marketingMaterialsInquiryEmpty")}
                    </p>
                  )}
                  {filteredInquiryMaterials.map((mat) => {
                    const cid = mat.campaignId ? String(mat.campaignId) : ""
                    const camp = cid ? campaignByIdMap.get(cid) : undefined
                    const deploymentRows = deploymentRowsForMaterial(mat.id).slice(0, 2)
                    const deploymentEditorKey = `inquiry:${mat.id}`
                    const isDeploymentEditorOpen = openDeploymentEditorKeys.has(deploymentEditorKey)
                    let campaignRef = ""
                    if (cid && camp) {
                      const no = (mat.campaignNo?.trim() || camp.campaignNo || "").trim()
                      const topic = (camp.topic || "").trim()
                      campaignRef = [no ? `[${no}]` : "", topic].filter(Boolean).join(" ").trim()
                    } else if (cid) {
                      campaignRef = (mat.campaignNo?.trim() || cid).trim()
                    }
                    return (
                      <div
                        key={mat.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{mat.name}</span>
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                MATERIAL_STATUS_COLORS[mat.status] || "bg-gray-100 text-gray-700"
                              )}
                            >
                              {materialStatusLabel(mat.status)}
                            </span>
                            <span className="text-xs text-muted-foreground">{materialTypeLabel(mat.type)}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {formatMatDisplayPeriod(mat.displayStartDate, mat.displayEndDate) && (
                              <span className="font-medium text-foreground">
                                {t("marketingRecordDisplayWindowTitle")}:{" "}
                                {formatMatDisplayPeriod(mat.displayStartDate, mat.displayEndDate)}
                              </span>
                            )}
                            <span>
                              {tr("수량", "Qty", "จำนวน")}: {mat.quantity}
                            </span>
                            {mat.isHqWide && (
                              <span className="text-indigo-800 dark:text-indigo-200">{hqLabel}</span>
                            )}
                            {mat.branches && mat.branches.length > 0 && !mat.isHqWide && (
                              <span>
                                {tr("매장", "Stores", "สาขา")}: {mat.branches.join(", ")}
                              </span>
                            )}
                            {(mat.placementSpots || []).length > 0 && (
                              <span>
                                {tr("위치", "Placement", "ตำแหน่ง")}:{" "}
                                {(mat.placementSpots || []).map((s) => materialPlacementSpotLabel(s)).join(", ")}
                              </span>
                            )}
                            {deploymentRows.length > 0 && (
                              <span>
                                {tr("배치", "Deployment", "การติดตั้ง")}:{" "}
                                {deploymentRows
                                  .map(
                                    (d) =>
                                      `${d.storeName}(${formatDeploymentPeriod(d.installedOn, d.removedOn)})`
                                  )
                                  .join(" · ")}
                              </span>
                            )}
                            {(mat.actualCost > 0 || mat.unitCost > 0) && (
                              <span>
                                {tr("실비", "Actual", "จริง")} ฿{mat.actualCost.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {campaignRef ? (
                              <>
                                <span className="font-medium text-foreground/80">
                                  {tr("연결 캠페인", "Linked campaign", "แคมเปญที่เชื่อม")}
                                </span>
                                {": "}
                                <span className="font-mono">{campaignRef}</span>
                              </>
                            ) : (
                              tr("캠페인 미연결", "No campaign linked", "ยังไม่เชื่อมแคมเปญ")
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => openMaterialByCampaignTab(mat)}
                          >
                            {t("marketingMaterialsOpenByCampaignTab")}
                          </Button>
                          {mat.campaignId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-xs"
                              onClick={() =>
                                router.push(
                                  `/admin/marketing/campaigns?openCampaign=${mat.campaignId}&tab=materials`
                                )
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {tr("캠페인에서 수정", "Edit in Campaign", "แก้ไขในแคมเปญ")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:text-destructive"
                            onClick={() => void handleDeleteInquiryMaterial(mat)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="w-full">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`${ADMIN_BTN_XS_CN} px-0 text-xs text-muted-foreground hover:text-foreground`}
                            onClick={() => toggleDeploymentEditor(deploymentEditorKey)}
                          >
                            {isDeploymentEditorOpen
                              ? tr("배치 이력 닫기", "Hide deployments", "ซ่อนรายการติดตั้ง")
                              : tr("배치 이력 편집", "Edit deployments", "แก้ไขการติดตั้ง")}
                          </Button>
                          {isDeploymentEditorOpen && (
                            <MarketingMaterialDeploymentEditor
                              materialId={mat.id}
                              campaignId={mat.campaignId}
                              materialType={mat.type}
                              stores={stores}
                              deployments={deploymentRowsForMaterial(mat.id)}
                              placementOptions={placementOptions}
                              materialTypeOptions={materialTypeOptions}
                              tr={tr}
                              onSaved={refreshMaterialDeployments}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <MarketingMaterialPicklistsDialog
          open={materialPicklistsDialogOpen}
          onOpenChange={setMaterialPicklistsDialogOpen}
          types={materialTypeOptions}
          placements={placementOptions}
          onTypesApplied={setMaterialTypeOptions}
          onPlacementsApplied={setPlacementOptions}
          labels={{
            title: tr("홍보물 선택지 편집", "Edit material picklists", "แก้ไขตัวเลือกสื่อ"),
            hint: tr(
              "이 브라우저에만 저장됩니다. 탭에서 종류·매장 위치를 각각 편집한 뒤 저장하면 둘 다 반영됩니다.",
              "Saved in this browser only. Edit types and placements in each tab, then save to apply both.",
              "บันทึกในเบราว์เซอร์นี้เท่านั้น — แก้ประเภทและตำแหน่งในแต่ละแท็บแล้วกดบันทึกเพื่อใช้ทั้งคู่",
            ),
            typeTab: tr("종류", "Types", "ประเภท"),
            placementTab: tr("매장 위치", "Placements", "ตำแหน่ง"),
            typeDisplayName: tr("종류 이름", "Type label", "ชื่อประเภท"),
            placementDisplayName: tr("위치 이름", "Placement label", "ชื่อตำแหน่ง"),
            save: tr("저장", "Save", "บันทึก"),
            cancel: tr("취소", "Cancel", "ยกเลิก"),
          }}
          tr={tr}
        />
    </MarketingPageShell>
  )
}
