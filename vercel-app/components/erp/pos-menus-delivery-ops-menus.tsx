"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatPosMenuImageUploadSpecHint } from "@/lib/pos-menu-image-upload-spec"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { Checkbox } from "@/components/ui/checkbox"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import type { PosMenu, PosDeliveryMenuPolicy, DeliveryAppCode } from "@/lib/api-client"

export interface PosDeliveryOpsMenuPoliciesProps {
  t: (k: string) => string
  deliveryOpsSearch: string
  setDeliveryOpsSearch: React.Dispatch<React.SetStateAction<string>>
  deliveryOpsBulkSellStart: string
  setDeliveryOpsBulkSellStart: React.Dispatch<React.SetStateAction<string>>
  deliveryOpsBulkSellEnd: string
  setDeliveryOpsBulkSellEnd: React.Dispatch<React.SetStateAction<string>>
  handleApplyBulkSellTimes: () => Promise<void>
  deliveryOpsVisibleMenus: PosMenu[]
  deliveryOpsMenuPolicyMap: Record<string, PosDeliveryMenuPolicy>
  deliveryOpsStoreCode: string
  deliveryOpsAppCode: DeliveryAppCode
  upsertDeliveryMenuPolicy: (menuId: string, patch: Partial<PosDeliveryMenuPolicy>) => void
  deliveryOpsImageInputRefs: React.RefObject<Record<string, HTMLInputElement | null>>
  handleUploadDeliveryMenuImage: (menu: PosMenu, file: File) => Promise<void>
  deliveryOpsImageUploadingMenuId: string | null
}

export function PosDeliveryOpsMenuPolicies({
  t,
  deliveryOpsSearch,
  setDeliveryOpsSearch,
  deliveryOpsBulkSellStart,
  setDeliveryOpsBulkSellStart,
  deliveryOpsBulkSellEnd,
  setDeliveryOpsBulkSellEnd,
  handleApplyBulkSellTimes,
  deliveryOpsVisibleMenus,
  deliveryOpsMenuPolicyMap,
  deliveryOpsStoreCode,
  deliveryOpsAppCode,
  upsertDeliveryMenuPolicy,
  deliveryOpsImageInputRefs,
  handleUploadDeliveryMenuImage,
  deliveryOpsImageUploadingMenuId,
}: PosDeliveryOpsMenuPoliciesProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">{t("posDeliveryOpsVisibleMenus") || "배달앱 노출 메뉴"}</h4>
        <Input
          className="h-8 w-60 text-xs"
          value={deliveryOpsSearch}
          onChange={(e) => setDeliveryOpsSearch(e.target.value)}
          placeholder={t("itemsSearchPh") || "검색"}
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <span className="text-xs font-semibold shrink-0">
            {t("posDeliveryOpsBulkSellTimes") || "판매 시간 일괄"}
          </span>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">
              {t("posDeliveryOpsSellStart") || "판매 시작"}
            </label>
            <Input
              type="time"
              className="h-8 w-32 text-xs"
              value={deliveryOpsBulkSellStart}
              onChange={(e) => setDeliveryOpsBulkSellStart(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-muted-foreground">
              {t("posDeliveryOpsSellEnd") || "판매 종료"}
            </label>
            <Input
              type="time"
              className="h-8 w-32 text-xs"
              value={deliveryOpsBulkSellEnd}
              onChange={(e) => setDeliveryOpsBulkSellEnd(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => void handleApplyBulkSellTimes()}>
            {t("posDeliveryOpsBulkSellApply") || "전체 메뉴에 적용"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {t("posDeliveryOpsBulkSellHint") ||
            "하루 판매 가능 시간(HH:mm)입니다. 공란이면 Grab에 종일 판매(OpenAllDay)로 전송됩니다. 저장 시 Grab 메뉴(serviceHours)에 반영됩니다. 프로모 기간·컷프라이스(취소선)는 POS 프로모·Grab 캠페인과 별도입니다."}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {formatPosMenuImageUploadSpecHint(t)}
        </p>
      </div>
      <div className="max-h-[420px] overflow-auto border rounded">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80">
            <tr className="border-b">
              <th className="p-2 text-left">{t("posMenuName") || "메뉴"}</th>
              <th className="p-2 text-center w-16">{t("use") || "사용"}</th>
              <th className="p-2 text-center w-20">{t("sortOrder") || "순서"}</th>
              <th className="p-2 text-center w-24">{t("posDeliveryOpsSellStart") || "판매 시작"}</th>
              <th className="p-2 text-center w-24">{t("posDeliveryOpsSellEnd") || "판매 종료"}</th>
              <th className="p-2 text-center w-24">{t("posDeliveryOpsStockQty") || "재고수량"}</th>
              <th className="p-2 text-center w-20">{t("posSoldOut") || "품절"}</th>
              <th className="p-2 text-center w-44">{t("image") || "이미지"}</th>
            </tr>
          </thead>
          <tbody>
            {deliveryOpsVisibleMenus.map((m) => {
              const policy = deliveryOpsMenuPolicyMap[String(m.id)] || {
                storeCode: deliveryOpsStoreCode,
                appCode: deliveryOpsAppCode,
                menuId: Number(m.id),
                enabled: true,
                sortOrder: m.sortOrder ?? 0,
                sellStartTime: null,
                sellEndTime: null,
                stockQty: null,
                soldOut: false,
                autoStopOnZero: true,
                imageUrl: null,
              }
              const fallbackImageUrl = String(m.imageUrl || "").trim()
              const overrideImageUrl = String(policy.imageUrl || "").trim()
              const effectiveImageUrl = overrideImageUrl || fallbackImageUrl
              return (
                <tr key={m.id} className="border-b last:border-b-0">
                  <td className="p-2">
                    <div className="font-medium">{m.code} - {m.name}</div>
                    <div className="text-muted-foreground">{m.categoryMain || "-"} / {translatePosMenuCategoryLabel(m.category || "-", t)}</div>
                  </td>
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={policy.enabled}
                      onCheckedChange={(v) => upsertDeliveryMenuPolicy(String(m.id), { enabled: Boolean(v) })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      className="h-7 text-right"
                      value={String(policy.sortOrder ?? 0)}
                      onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { sortOrder: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      className="h-7"
                      value={String(policy.sellStartTime ?? "")}
                      onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { sellStartTime: e.target.value || null })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      className="h-7"
                      value={String(policy.sellEndTime ?? "")}
                      onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { sellEndTime: e.target.value || null })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      className="h-7 text-right"
                      value={policy.stockQty == null ? "" : String(policy.stockQty)}
                      onChange={(e) => upsertDeliveryMenuPolicy(String(m.id), { stockQty: e.target.value === "" ? null : Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={policy.soldOut}
                      onCheckedChange={(v) => upsertDeliveryMenuPolicy(String(m.id), { soldOut: Boolean(v) })}
                    />
                  </td>
                  <td className="p-2">
                    <input
                      ref={(el) => {
                        deliveryOpsImageInputRefs.current[String(m.id)] = el
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          await handleUploadDeliveryMenuImage(m, file)
                        }
                        e.currentTarget.value = ""
                      }}
                    />
                    <div className="flex items-center justify-center gap-1.5">
                      {effectiveImageUrl ? (
                        <img
                          src={effectiveImageUrl}
                          alt={`${m.name} delivery`}
                          className="h-8 w-8 rounded border object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded border bg-muted" />
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                        disabled={deliveryOpsImageUploadingMenuId === String(m.id)}
                        onClick={() => deliveryOpsImageInputRefs.current[String(m.id)]?.click()}
                      >
                        {deliveryOpsImageUploadingMenuId === String(m.id)
                          ? (t("loading") || "업로드중")
                          : (t("upload") || "업로드")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                        disabled={!overrideImageUrl}
                        onClick={() => upsertDeliveryMenuPolicy(String(m.id), { imageUrl: null })}
                      >
                        {t("reset") || "기본"}
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
