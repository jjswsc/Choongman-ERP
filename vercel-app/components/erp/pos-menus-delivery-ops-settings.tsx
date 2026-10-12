"use client"

import * as React from "react"
import { PosScreenConfigStoreSelect } from "@/components/pos/pos-screen-config-store-select"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import type { DeliveryAppCode, PosDeliveryAppPolicy } from "@/lib/api-client"
import { Input } from "@/components/ui/input"
import type { AuthState } from "@/lib/auth-context"

export interface PosDeliveryOpsSettingsProps {
  t: (k: string) => string
  deliveryOpsStoreDraft: string
  setDeliveryOpsStoreDraft: React.Dispatch<React.SetStateAction<string>>
  canSearchAllStores: boolean
  stores: string[]
  auth: AuthState | null
  storeLabels: Record<string, string>
  handleQueryDeliveryOps: () => void
  deliveryOpsLoading: boolean
  deliveryOpsStoreCode: string
  deliveryOpsStoreDraftPending: boolean
  formatStoreLabel: (code: string) => string
  deliveryOpsAppCode: DeliveryAppCode
  setDeliveryOpsAppCode: React.Dispatch<React.SetStateAction<DeliveryAppCode>>
  deliveryOpsAppPolicy: PosDeliveryAppPolicy
  setDeliveryOpsAppPolicy: React.Dispatch<React.SetStateAction<PosDeliveryAppPolicy>>
}

export function PosDeliveryOpsSettings({
  t,
  deliveryOpsStoreDraft,
  setDeliveryOpsStoreDraft,
  canSearchAllStores,
  stores,
  auth,
  storeLabels,
  handleQueryDeliveryOps,
  deliveryOpsLoading,
  deliveryOpsStoreCode,
  deliveryOpsStoreDraftPending,
  formatStoreLabel,
  deliveryOpsAppCode,
  setDeliveryOpsAppCode,
  deliveryOpsAppPolicy,
  setDeliveryOpsAppPolicy,
}: PosDeliveryOpsSettingsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="md:col-span-2">
        <label className="text-xs font-semibold">{t("store") || "매장"}</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <PosScreenConfigStoreSelect
            value={deliveryOpsStoreDraft || undefined}
            onValueChange={setDeliveryOpsStoreDraft}
            stores={(canSearchAllStores ? stores : [auth?.store || ""]).filter(Boolean)}
            storeLabels={storeLabels}
            disabled={!canSearchAllStores && !auth?.store}
            className="h-9 min-w-[10rem] flex-1 max-w-md"
            searchPlaceholder={t("outStoreSearchPh") || "매장 검색"}
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1.5 shrink-0"
            onClick={handleQueryDeliveryOps}
            disabled={deliveryOpsLoading || !String(deliveryOpsStoreDraft || "").trim()}
          >
            <Search className="h-4 w-4" />
            {t("search") || t("btn_query") || "조회"}
          </Button>
          {deliveryOpsStoreCode ? (
            <span
              className={cn(
                "inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium",
                deliveryOpsStoreDraftPending
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              )}
            >
              {(t("posDeliveryOpsLoadedStore") || "현재 조회").replace(
                "{{store}}",
                formatStoreLabel(deliveryOpsStoreCode) || deliveryOpsStoreCode
              )}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
          {deliveryOpsStoreDraftPending
            ? t("posDeliveryOpsStorePendingQuery") ||
              "매장을 바꾸었습니다. [조회]를 눌러 해당 매장 설정을 불러오세요."
            : t("posScreenConfigStoreQueryHint") ||
              "매장명·코드로 검색한 뒤 [조회]를 눌러 해당 매장 설정을 불러오세요."}
        </p>
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posDeliveryOpsApp") || "앱"}</label>
        <Select value={deliveryOpsAppCode} onValueChange={(v) => setDeliveryOpsAppCode(v as DeliveryAppCode)}>
          <SelectTrigger className="mt-1 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="grab">Grab</SelectItem>
            <SelectItem value="lineman">LineMan</SelectItem>
            <SelectItem value="shopee">Shopee</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posDeliveryOpsAcceptMode") || "주문 수락 모드"}</label>
        <Select
          value={deliveryOpsAppPolicy.orderAcceptanceMode}
          onValueChange={(v) =>
            setDeliveryOpsAppPolicy((p) => ({ ...p, orderAcceptanceMode: v as "manual" | "auto" }))
          }
        >
          <SelectTrigger className="mt-1 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t("posDeliveryOpsAcceptModeManual") || "수동"}</SelectItem>
            <SelectItem value="auto">{t("posDeliveryOpsAcceptModeAuto") || "자동"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold">
          {t("posDeliveryOpsSettlementFeePct") || "플랫폼 정산 수수료 (%)"}
        </label>
        <Input
          type="number"
          min={0}
          max={100}
          step={0.01}
          className="mt-1 h-9 tabular-nums"
          placeholder={t("posDeliveryOpsSettlementFeePctPh") || "미입력 시 25%"}
          value={
            deliveryOpsAppPolicy.settlementFeePct != null
              ? String(deliveryOpsAppPolicy.settlementFeePct)
              : ""
          }
          onChange={(e) => {
            const raw = e.target.value.trim()
            setDeliveryOpsAppPolicy((p) => ({
              ...p,
              settlementFeePct: raw === "" ? null : Math.max(0, Math.min(100, Number(raw) || 0)),
            }))
          }}
        />
        <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
          {t("posDeliveryOpsSettlementFeePctHint") ||
            "앱이 매출에서 차감·익일 NET 입금하는 비율. 본사 PO 배달 GP 청구와 별도."}
        </p>
      </div>
      <div className="flex items-end gap-4 pb-1">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={deliveryOpsAppPolicy.enabled}
            onChange={(e) => setDeliveryOpsAppPolicy((p) => ({ ...p, enabled: e.target.checked }))}
          />
          {t("posDeliveryOpsEnabled") || "앱 연동 사용"}
        </label>
      </div>
    </div>
  )
}
