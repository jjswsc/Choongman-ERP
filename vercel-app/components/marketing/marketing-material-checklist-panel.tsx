"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import Link from "next/link"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, RotateCw, ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react"
import {
  MarketingMaterialInstallPhotoField,
  MarketingMaterialInstallPhotoThumb,
} from "@/components/marketing/marketing-material-install-photo-field"
import { uploadMarketingMaterialInstallPhoto } from "@/lib/marketing-material-install-photo-upload"
import {
  getMarketingMaterials,
  getMarketingMaterialStoreChecks,
  saveMarketingMaterial,
  saveMarketingMaterialStoreCheck,
  type MarketingCampaign,
  type MarketingMaterial,
  type MarketingMaterialStoreCheck,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import { getBangkokDateStr } from "@/lib/pos-business-day"
import { isAccountingRole, isFranchiseeRole, isManagerRole, isOfficeRole } from "@/lib/permissions"
import { MarketingHubCampaignContextStrip } from "@/components/marketing/marketing-hub-campaign-context-strip"
import {
  defaultMarketingMaterialPlacementOptions,
  loadMarketingMaterialPlacementOptions,
  resolvePlacementLabel,
  type MarketingMaterialPlacementOption,
} from "@/lib/marketing-material-placement-options"
import {
  defaultMarketingMaterialTypeOptions,
  loadMarketingMaterialTypeOptions,
  resolveMaterialTypeLabel,
  type MarketingMaterialTypeOption,
} from "@/lib/marketing-material-type-options"
import {
  CHECKLIST_DEFAULT_MATERIAL_TYPES,
  filterChecklistMaterials,
  findStoreCheckForBranch,
  materialChecklistProgress,
  materialTargetStores,
  storeCheckKey,
} from "@/lib/marketing-material-checklist-utils"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"

type Props = {
  campaignId: string
  onCampaignIdChange: (id: string) => void
  campaigns: MarketingCampaign[]
  onRefreshParent?: () => void | Promise<void>
  hqLabel: string
  formatStoreLabel: (store: string) => string
  stores: string[]
  /** 모바일 주문 탭 — 매장 할 일만, 본사 테이블 숨김 */
  mobileMode?: boolean
  /** 모바일·본사 매장 보기 시 체크 대상 매장 */
  storeNameOverride?: string
}

export function MarketingMaterialChecklistPanel({
  campaignId,
  onCampaignIdChange,
  campaigns,
  onRefreshParent,
  hqLabel,
  formatStoreLabel,
  stores,
  mobileMode = false,
  storeNameOverride = "",
}: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      if (lang === "ko") return ko
      return en
    },
    [lang]
  )

  const role = String(auth?.role || "")
  const userStore = String(auth?.store || "").trim()
  const effectiveStoreName = String(storeNameOverride || userStore).trim()
  const isHqView = mobileMode ? false : isOfficeRole(role) || isAccountingRole(role)
  const isStoreUser = mobileMode
    ? Boolean(effectiveStoreName)
    : isManagerRole(role) || isFranchiseeRole(role)

  const [loading, setLoading] = React.useState(true)
  const [materials, setMaterials] = React.useState<MarketingMaterial[]>([])
  const [checks, setChecks] = React.useState<MarketingMaterialStoreCheck[]>([])
  const [typeOptions, setTypeOptions] = React.useState<MarketingMaterialTypeOption[]>(
    defaultMarketingMaterialTypeOptions()
  )
  const [placementOptions, setPlacementOptions] = React.useState<MarketingMaterialPlacementOption[]>(
    defaultMarketingMaterialPlacementOptions()
  )
  const [includeAllTypes, setIncludeAllTypes] = React.useState(false)
  const [storeFilter, setStoreFilter] = React.useState(() => {
    if (mobileMode && effectiveStoreName) return effectiveStoreName
    return isManagerRole(role) || isFranchiseeRole(role) ? userStore : ""
  })
  const [expandedMaterialId, setExpandedMaterialId] = React.useState<string | null>(null)
  const [showDone, setShowDone] = React.useState(false)
  const [savingKey, setSavingKey] = React.useState("")
  const [installDrafts, setInstallDrafts] = React.useState<Record<string, { date: string; spot: string }>>({})
  const [installPhotoFiles, setInstallPhotoFiles] = React.useState<Record<string, File | null>>({})

  React.useEffect(() => {
    setTypeOptions(loadMarketingMaterialTypeOptions())
    setPlacementOptions(loadMarketingMaterialPlacementOptions())
  }, [])

  React.useEffect(() => {
    if (mobileMode && effectiveStoreName) {
      setStoreFilter(effectiveStoreName)
      return
    }
    if (isStoreUser && userStore) setStoreFilter(userStore)
  }, [mobileMode, effectiveStoreName, isStoreUser, userStore])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const cid = campaignId.trim()
      const [mats, chk] = await Promise.all([
        cid ? getMarketingMaterials({ campaignId: cid }) : getMarketingMaterials(),
        cid
          ? getMarketingMaterialStoreChecks({ campaignId: cid })
          : getMarketingMaterialStoreChecks(),
      ])
      setMaterials(Array.isArray(mats) ? mats : [])
      setChecks(Array.isArray(chk) ? chk : [])
    } catch {
      setMaterials([])
      setChecks([])
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  const typeFilter = includeAllTypes ? undefined : CHECKLIST_DEFAULT_MATERIAL_TYPES

  const lookupCheck = React.useCallback(
    (materialId: string, branchStore: string) =>
      findStoreCheckForBranch(checks, materialId, branchStore),
    [checks]
  )

  const checklistMaterials = React.useMemo(
    () =>
      filterChecklistMaterials(materials, {
        types: typeFilter,
        campaignId: campaignId.trim() || undefined,
      }),
    [materials, typeFilter, campaignId]
  )

  const materialTypeLabel = React.useCallback(
    (value: string) => resolveMaterialTypeLabel(value, typeOptions, tr),
    [typeOptions, tr]
  )

  const placementLabel = React.useCallback(
    (value: string) => resolvePlacementLabel(value, placementOptions, tr),
    [placementOptions, tr]
  )

  const saveProduction = async (material: MarketingMaterial, producedOn: string | null) => {
    if (!material.campaignId) return
    const key = `prod:${material.id}`
    setSavingKey(key)
    try {
      const res = await saveMarketingMaterial({
        id: material.id,
        campaignId: material.campaignId,
        name: material.name,
        type: material.type,
        quantity: material.quantity,
        unitCost: material.unitCost,
        actualCost: material.actualCost,
        branches: material.branches,
        isHqWide: material.isHqWide,
        displayStartDate: material.displayStartDate,
        displayEndDate: material.displayEndDate,
        placementSpots: material.placementSpots,
        status: producedOn ? "completed" : material.status,
        producedOn,
        note: material.note,
      })
      if (!res.success) {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
        return
      }
      await loadData()
      await onRefreshParent?.()
    } finally {
      setSavingKey("")
    }
  }

  const confirmReceived = async (material: MarketingMaterial, storeName: string) => {
    const key = `recv:${material.id}:${storeName}`
    setSavingKey(key)
    try {
      const existing = lookupCheck(material.id, storeName)
      const today = getBangkokDateStr()
      const res = await saveMarketingMaterialStoreCheck({
        id: existing?.id,
        materialId: material.id,
        campaignId: material.campaignId,
        storeName,
        receivedOn: today,
        materialType: material.type,
      })
      if (!res.success) {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
        return
      }
      await loadData()
      await onRefreshParent?.()
    } finally {
      setSavingKey("")
    }
  }

  const confirmInstalled = async (material: MarketingMaterial, storeName: string) => {
    const draftKey = storeCheckKey(material.id, storeName)
    const draft = installDrafts[draftKey] || {
      date: getBangkokDateStr(),
      spot: material.placementSpots[0] || placementOptions[0]?.value || "counter",
    }
    if (!draft.date.trim()) {
      await appAlert(tr("설치일을 입력하세요.", "Enter install date.", "กรอกวันที่ติดตั้ง"))
      return
    }
    const key = `inst:${material.id}:${storeName}`
    setSavingKey(key)
    try {
      const existing = lookupCheck(material.id, storeName)
      let installedPhotoUrl = existing?.installedPhotoUrl?.trim() || ""
      const photoFile = installPhotoFiles[draftKey]
      if (photoFile) {
        const up = await uploadMarketingMaterialInstallPhoto({
          storeName,
          materialId: material.id,
          campaignId: material.campaignId,
          file: photoFile,
        })
        if (!up.success || !up.url) {
          await appAlert(translateApiMessage(up.message, t) || tr("사진 업로드 실패", "Photo upload failed", "อัปโหลดรูปไม่สำเร็จ"))
          return
        }
        installedPhotoUrl = up.url
      }
      const res = await saveMarketingMaterialStoreCheck({
        id: existing?.id,
        materialId: material.id,
        campaignId: material.campaignId,
        storeName,
        receivedOn: existing?.receivedOn || getBangkokDateStr(),
        installedOn: draft.date,
        installedPlacementSpot: draft.spot,
        installedPhotoUrl: installedPhotoUrl || null,
        materialType: material.type,
      })
      if (!res.success) {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
        return
      }
      setInstallPhotoFiles((prev) => {
        const next = { ...prev }
        delete next[draftKey]
        return next
      })
      await loadData()
      await onRefreshParent?.()
    } finally {
      setSavingKey("")
    }
  }

  const storeTasks = React.useMemo(() => {
    const targetStore = storeFilter.trim()
    if (!targetStore) return []
    const rows: {
      material: MarketingMaterial
      phase: "waiting_production" | "receive" | "install" | "done"
      check?: MarketingMaterialStoreCheck
    }[] = []
    for (const material of checklistMaterials) {
      const targets = materialTargetStores(material, hqLabel)
      if (!targets.some((s) => storesMatchForGradeLookup(s, targetStore))) continue
      const check = lookupCheck(material.id, targetStore)
      const produced = Boolean((material.producedOn || "").trim())
      let phase: "waiting_production" | "receive" | "install" | "done" = "done"
      if (!produced) phase = "waiting_production"
      else if (!check?.receivedOn) phase = "receive"
      else if (!check?.installedOn) phase = "install"
      if (phase === "done" && !showDone) continue
      rows.push({ material, phase, check })
    }
    return rows
  }, [checklistMaterials, storeFilter, lookupCheck, hqLabel, showDone])

  const hasCampaign = Boolean(campaignId.trim())

  return (
    <div className={cn("space-y-4", mobileMode && "space-y-3")}>
      <MarketingHubCampaignContextStrip
        value={campaignId}
        onChange={onCampaignIdChange}
        campaigns={campaigns}
        allowEmpty
        emptyOptionLabel={tr("캠페인 선택…", "Select campaign…", "เลือกแคมเปญ…")}
        onRefresh={async () => {
          if (!hasCampaign) return
          await loadData()
          await onRefreshParent?.()
        }}
        disabled={loading}
      />

      {!hasCampaign ? (
        <div className="rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("marketingMaterialChecklistNeedCampaign")}
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => void loadData()} disabled={loading}>
          <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh") || tr("새로고침", "Refresh", "รีเฟรช")}
        </Button>
        {isHqView && (
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{tr("전체 매장", "All stores", "ทุกสาขา")}</option>
            {stores.map((s) => (
              <option key={s} value={s}>
                {formatStoreLabel(s)}
              </option>
            ))}
          </select>
        )}
        {isStoreUser && effectiveStoreName && !mobileMode && (
          <span className="text-sm text-muted-foreground">
            {tr("매장", "Store", "สาขา")}: <strong>{formatStoreLabel(effectiveStoreName)}</strong>
          </span>
        )}
        {!mobileMode && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={includeAllTypes} onCheckedChange={(v) => setIncludeAllTypes(v === true)} />
          {t("marketingMaterialChecklistAllTypes")}
        </label>
        )}
        {!isHqView && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={showDone} onCheckedChange={(v) => setShowDone(v === true)} />
            {t("marketingMaterialChecklistShowDone")}
          </label>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("marketingMaterialChecklistHint")}</p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      )}

      {isHqView && !storeFilter && !mobileMode && (
        <AdminTableScroll className="rounded-xl border bg-card" hint={false}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">{tr("홍보물", "Material", "สื่อ")}</th>
                <th className="px-3 py-2">{tr("종류", "Type", "ประเภท")}</th>
                <th className="px-3 py-2">{tr("제작완료", "Produced", "ผลิตเสร็จ")}</th>
                <th className="px-3 py-2">{tr("수령", "Received", "รับแล้ว")}</th>
                <th className="px-3 py-2">{tr("설치", "Installed", "ติดตั้ง")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {checklistMaterials.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {t("marketingMaterialChecklistEmpty")}
                  </td>
                </tr>
              )}
              {checklistMaterials.map((material) => {
                const progress = materialChecklistProgress(material, checks, hqLabel)
                const producedOn = (material.producedOn || "").trim()
                const isExpanded = expandedMaterialId === material.id
                const targetStores = materialTargetStores(material, hqLabel)
                return (
                  <React.Fragment key={material.id}>
                    <tr className="border-b">
                      <td className="px-3 py-2 font-medium">{material.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{materialTypeLabel(material.type)}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="date"
                          className="h-9 w-36"
                          defaultValue={producedOn}
                          key={`${material.id}:${producedOn}`}
                          disabled={savingKey === `prod:${material.id}`}
                          onBlur={(e) => {
                            const v = e.target.value
                            const cur = (material.producedOn || "").trim()
                            if (v === cur) return
                            void saveProduction(material, v || null)
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {progress.receivedCount}/{progress.storeCount}
                      </td>
                      <td className="px-3 py-2">
                        {progress.installedCount}/{progress.storeCount}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setExpandedMaterialId(isExpanded ? null : material.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-muted/10">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {targetStores.map((storeName) => {
                              const check = lookupCheck(material.id, storeName)
                              return (
                                <div
                                  key={storeName}
                                  className="rounded-lg border bg-background px-3 py-2 text-xs"
                                >
                                  <div className="font-medium">{formatStoreLabel(storeName)}</div>
                                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                                    <div>
                                      {tr("수령", "Received", "รับ")}: {check?.receivedOn || "—"}
                                    </div>
                                    <div>
                                      {tr("설치", "Installed", "ติดตั้ง")}: {check?.installedOn || "—"}
                                      {check?.installedPlacementSpot
                                        ? ` (${placementLabel(check.installedPlacementSpot)})`
                                        : ""}
                                    </div>
                                    {check?.installedPhotoUrl ? (
                                      <div className="mt-1 flex items-center gap-2">
                                        <span>{tr("사진", "Photo", "รูป")}:</span>
                                        <MarketingMaterialInstallPhotoThumb
                                          url={check.installedPhotoUrl}
                                          title={material.name}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </AdminTableScroll>
      )}

      {(isStoreUser || (isHqView && storeFilter)) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            {isStoreUser
              ? t("marketingMaterialChecklistStoreTasks")
              : tr("매장 확인", "Store checks", "ตรวจสอบสาขา")}
          </div>
          {storeTasks.length === 0 && !loading && (
            <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {t("marketingMaterialChecklistStoreEmpty")}
            </p>
          )}
          {storeTasks.map(({ material, phase, check }) => {
            const draftKey = storeCheckKey(material.id, storeFilter)
            const installDraft = installDrafts[draftKey] || {
              date: getBangkokDateStr(),
              spot: material.placementSpots[0] || placementOptions[0]?.value || "counter",
            }
            return (
              <div key={material.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{material.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {materialTypeLabel(material.type)}
                      {material.producedOn ? ` · ${tr("제작", "Produced", "ผลิต")} ${material.producedOn}` : ""}
                    </div>
                  </div>
                  {phase === "waiting_production" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      {t("marketingMaterialChecklistWaitingProduction")}
                    </span>
                  )}
                  {phase === "done" && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      {t("marketingMaterialChecklistDone")}
                    </span>
                  )}
                </div>
                {phase === "receive" && (
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={savingKey === `recv:${material.id}:${storeFilter}`}
                    onClick={() => void confirmReceived(material, storeFilter)}
                  >
                    {savingKey === `recv:${material.id}:${storeFilter}` ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : null}
                    {t("marketingMaterialChecklistConfirmReceived")}
                  </Button>
                )}
                {phase === "install" && (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">{tr("설치일", "Install date", "วันติดตั้ง")}</label>
                        <Input
                          type="date"
                          className="mt-1 h-9 w-40"
                          value={installDraft.date}
                          onChange={(e) =>
                            setInstallDrafts((prev) => ({
                              ...prev,
                              [draftKey]: { ...installDraft, date: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">{tr("위치", "Placement", "ตำแหน่ง")}</label>
                        <select
                          className="mt-1 flex h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
                          value={installDraft.spot}
                          onChange={(e) =>
                            setInstallDrafts((prev) => ({
                              ...prev,
                              [draftKey]: { ...installDraft, spot: e.target.value },
                            }))
                          }
                        >
                          {placementOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {placementLabel(o.value)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <MarketingMaterialInstallPhotoField
                      label={t("marketingMaterialChecklistInstallPhoto")}
                      hint={t("marketingMaterialChecklistInstallPhotoHint")}
                      optionalLabel={t("marketingMaterialChecklistInstallPhotoOptional")}
                      previewUrl={check?.installedPhotoUrl}
                      disabled={savingKey === `inst:${material.id}:${storeFilter}`}
                      onPickFile={(file) =>
                        setInstallPhotoFiles((prev) => ({
                          ...prev,
                          [draftKey]: file,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      disabled={savingKey === `inst:${material.id}:${storeFilter}`}
                      onClick={() => void confirmInstalled(material, storeFilter)}
                    >
                      {savingKey === `inst:${material.id}:${storeFilter}` ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      {t("marketingMaterialChecklistConfirmInstalled")}
                    </Button>
                  </div>
                )}
                {phase === "done" && check && (
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <div>
                      {tr("수령", "Received", "รับ")} {check.receivedOn}
                      {check.installedOn
                        ? ` · ${tr("설치", "Installed", "ติดตั้ง")} ${check.installedOn} (${placementLabel(check.installedPlacementSpot || "counter")})`
                        : ""}
                    </div>
                    {check.installedPhotoUrl ? (
                      <div className="flex items-center gap-2">
                        <span>{t("marketingMaterialChecklistInstallPhoto")}:</span>
                        <MarketingMaterialInstallPhotoThumb
                          url={check.installedPhotoUrl}
                          title={material.name}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isHqView && !storeFilter && checklistMaterials.length > 0 && !mobileMode && (
        <p className="text-xs text-muted-foreground">
          <Link
            href={`/admin/marketing/materials?campaignId=${encodeURIComponent(campaignId)}&tab=checklist`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {tr("매장별 확인", "Per-store checks", "ตรวจสอบรายสาขา")}
          </Link>
          {tr(" — 상단에서 매장을 선택하세요.", " — pick a store above.", " — เลือกสาขาด้านบน")}
        </p>
      )}
        </>
      )}
    </div>
  )
}
