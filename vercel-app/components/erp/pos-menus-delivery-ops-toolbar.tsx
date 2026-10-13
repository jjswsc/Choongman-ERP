"use client"

import * as React from "react"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Save } from "lucide-react"

export interface PosDeliveryOpsToolbarProps {
  t: (k: string) => string
  canSearchAllStores: boolean
  deliveryOpsCopySourceStore: string
  setDeliveryOpsCopySourceStore: React.Dispatch<React.SetStateAction<string>>
  stores: string[]
  deliveryOpsStoreCode: string
  handleCopyDeliveryOpsFromStore: () => Promise<void>
  deliveryOpsCopying: boolean
  handleApplyDeliveryOpsToAllStores: () => Promise<void>
  deliveryOpsApplyingAll: boolean
  handleSaveDeliveryOpsPolicy: () => Promise<void>
  deliveryOpsSaving: boolean
}

export function PosDeliveryOpsToolbar({
  t,
  canSearchAllStores,
  deliveryOpsCopySourceStore,
  setDeliveryOpsCopySourceStore,
  stores,
  deliveryOpsStoreCode,
  handleCopyDeliveryOpsFromStore,
  deliveryOpsCopying,
  handleApplyDeliveryOpsToAllStores,
  deliveryOpsApplyingAll,
  handleSaveDeliveryOpsPolicy,
  deliveryOpsSaving,
}: PosDeliveryOpsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold">{t("posMenuTabDeliveryOps") || "배달앱 운영"}</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canSearchAllStores && (
          <>
            <Select
              value={deliveryOpsCopySourceStore || "__none__"}
              onValueChange={(v) => setDeliveryOpsCopySourceStore(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder={t("posTableLayoutCopyFrom") || "다른 매장에서 복사"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("posTableLayoutCopyFrom") || "다른 매장에서 복사"}</SelectItem>
                {stores
                  .filter((s) => s && s !== deliveryOpsStoreCode)
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => void handleCopyDeliveryOpsFromStore()}
              disabled={
                deliveryOpsCopying ||
                !deliveryOpsCopySourceStore ||
                deliveryOpsCopySourceStore === deliveryOpsStoreCode
              }
            >
              {deliveryOpsCopying ? (t("loading") || "처리 중...") : (t("posTableLayoutCopyBtn") || "복사")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              onClick={() => void handleApplyDeliveryOpsToAllStores()}
              disabled={deliveryOpsApplyingAll || stores.filter((s) => s && s !== deliveryOpsStoreCode).length === 0}
            >
              {deliveryOpsApplyingAll
                ? (t("loading") || "처리 중...")
                : (t("posDeliveryOpsApplyAll") || "전체 적용")}
            </Button>
          </>
        )}
        <Button type="button" onClick={handleSaveDeliveryOpsPolicy} disabled={deliveryOpsSaving}>
          <Save className="h-4 w-4 mr-1.5" />
          {deliveryOpsSaving ? (t("loading") || "저장 중...") : (t("itemsBtnSave") || "저장")}
        </Button>
      </div>
    </div>
  )
}
