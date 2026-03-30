"use client"

import * as React from "react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, Save, Trash2 } from "lucide-react"
import {
  deleteMarketingMaterialDeployment,
  saveMarketingMaterialDeployment,
  type MarketingMaterialDeployment,
} from "@/lib/api-client"
import {
  resolvePlacementLabel,
  type MarketingMaterialPlacementOption,
} from "@/lib/marketing-material-placement-options"
import {
  materialTypeSelectOptions,
  type MarketingMaterialTypeOption,
} from "@/lib/marketing-material-type-options"
import { getBangkokDateStr } from "@/lib/pos-business-day"

type DeploymentDraft = {
  key: string
  id?: string
  storeName: string
  placementSpot: string
  materialType: string
  installedOn: string
  removedOn: string
  note: string
}

type Props = {
  materialId: string
  campaignId: string | null
  materialType: string
  stores: string[]
  deployments: MarketingMaterialDeployment[]
  placementOptions: MarketingMaterialPlacementOption[]
  materialTypeOptions: MarketingMaterialTypeOption[]
  tr: (ko: string, en: string, th: string) => string
  onSaved: () => void
}

function toDraft(d: MarketingMaterialDeployment): DeploymentDraft {
  return {
    key: d.id,
    id: d.id,
    storeName: d.storeName,
    placementSpot: d.placementSpot || "counter",
    materialType: d.materialType || "",
    installedOn: d.installedOn || "",
    removedOn: d.removedOn || "",
    note: d.note || "",
  }
}

export function MarketingMaterialDeploymentEditor({
  materialId,
  campaignId,
  materialType,
  stores,
  deployments,
  placementOptions,
  materialTypeOptions,
  tr,
  onSaved,
}: Props) {
  const [rows, setRows] = React.useState<DeploymentDraft[]>([])
  const [savingKey, setSavingKey] = React.useState("")
  const depSig = React.useMemo(
    () => deployments.map((d) => `${d.id}:${d.updatedAt || ""}`).join("|"),
    [deployments]
  )

  React.useEffect(() => {
    setRows(deployments.map(toDraft))
  }, [depSig, deployments])

  const addRow = () => {
    const defaultPlacement = placementOptions[0]?.value || "counter"
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setRows((prev) => [
      ...prev,
      {
        key,
        storeName: stores[0] || "",
        placementSpot: defaultPlacement,
        materialType: "",
        installedOn: getBangkokDateStr(),
        removedOn: "",
        note: "",
      },
    ])
  }

  const updateRow = (key: string, patch: Partial<DeploymentDraft>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const saveRow = async (row: DeploymentDraft) => {
    if (!row.storeName.trim() || !row.installedOn.trim()) {
      await appAlert(
        tr(
          "매장과 설치일은 필수입니다.",
          "Store and installed date are required.",
          "จำเป็นต้องมีสาขาและวันที่ติดตั้ง"
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
    setSavingKey(row.key)
    try {
      const res = await saveMarketingMaterialDeployment({
        id: row.id,
        materialId,
        campaignId,
        storeName: row.storeName.trim(),
        placementSpot: row.placementSpot,
        materialType: row.materialType.trim() || null,
        installedOn: row.installedOn.trim(),
        removedOn: row.removedOn.trim() || null,
        note: row.note.trim(),
      })
      if (!res.success) {
        await appAlert(res.message || tr("저장 실패", "Save failed", "บันทึกไม่สำเร็จ"))
        return
      }
      onSaved()
    } finally {
      setSavingKey("")
    }
  }

  const deleteRow = async (row: DeploymentDraft) => {
    if (!row.id) {
      setRows((prev) => prev.filter((x) => x.key !== row.key))
      return
    }
    const ok = await appConfirm(
      tr("이 배치 이력을 삭제할까요?", "Delete this deployment row?", "ลบรายการติดตั้งนี้หรือไม่?")
    )
    if (!ok) return
    const res = await deleteMarketingMaterialDeployment({ id: row.id })
    if (!res.success) {
      await appAlert(res.message || tr("삭제 실패", "Delete failed", "ลบไม่สำเร็จ"))
      return
    }
    onSaved()
  }

  return (
    <div className="mt-2 rounded-lg border border-dashed p-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {tr("배치 이력 편집", "Edit deployments", "แก้ไขการติดตั้ง")}
        </p>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {tr("행 추가", "Add row", "เพิ่มแถว")}
        </Button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {tr("배치 이력이 없습니다.", "No deployment rows.", "ยังไม่มีรายการติดตั้ง")}
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="text-[10px] text-muted-foreground">{tr("매장", "Store", "สาขา")}</label>
                <select
                  value={row.storeName}
                  onChange={(e) => updateRow(row.key, { storeName: e.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">{tr("선택", "Select", "เลือก")}</option>
                  {stores.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("위치", "Placement", "ตำแหน่ง")}</label>
                <select
                  value={row.placementSpot}
                  onChange={(e) => updateRow(row.key, { placementSpot: e.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  {placementOptions.map((spot) => (
                    <option key={spot.value} value={spot.value}>
                      {resolvePlacementLabel(spot.value, placementOptions, tr)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("설치일", "Installed", "ติดตั้ง")}</label>
                <Input
                  type="date"
                  value={row.installedOn}
                  onChange={(e) => updateRow(row.key, { installedOn: e.target.value })}
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("철수일", "Removed", "เก็บออก")}</label>
                <Input
                  type="date"
                  value={row.removedOn}
                  onChange={(e) => updateRow(row.key, { removedOn: e.target.value })}
                  className="mt-1 h-8 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] text-muted-foreground">{tr("종류(선택)", "Type (opt)", "ประเภท (ไม่บังคับ)")}</label>
                <select
                  value={row.materialType}
                  onChange={(e) => updateRow(row.key, { materialType: e.target.value })}
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="">{tr("기본값 사용", "Use default", "ใช้ค่าเริ่มต้น")}</option>
                  {materialTypeSelectOptions(materialTypeOptions, materialType, tr).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1 flex flex-col justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={savingKey === row.key}
                  onClick={() => void saveRow(row)}
                >
                  {savingKey === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:text-destructive"
                  onClick={() => void deleteRow(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="sm:col-span-12">
                <Input
                  value={row.note}
                  onChange={(e) => updateRow(row.key, { note: e.target.value })}
                  className="h-8 text-xs"
                  placeholder={tr("메모(선택)", "Note (optional)", "หมายเหตุ (ไม่บังคับ)")}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
