"use client"

import * as React from "react"
import { Megaphone, RefreshCw, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import type { GrabErpPromoForCampaignLookup, GrabPromoCampaign } from "@/lib/api-client"

export interface PosGrabCampaignsPanelProps {
  t: (k: string) => string
  handleLoadGrabCampaigns: () => Promise<void>
  grabCampaignsLoading: boolean
  deliveryOpsStoreCode: string
  grabCampaignsMeta: { merchantIDs: string[]; hint: string; campaignsSuppressed?: boolean; consumerListPriceMode?: string; erpGrabPromos: GrabErpPromoForCampaignLookup[] } | null
  grabCampaignsRows: GrabPromoCampaign[] | null
  buildGrabSupportReplyText: () => string
  setGrabCampaignCopiedId: React.Dispatch<React.SetStateAction<string | null>>
  grabCampaignCopiedId: string | null
  handleCopyGrabCampaignId: (id: string) => Promise<void>
  grabCampaignCancellingId: string | null
  handleCancelGrabCampaign: (row: GrabPromoCampaign) => Promise<void>
}

export function PosGrabCampaignsPanel({
  t,
  handleLoadGrabCampaigns,
  grabCampaignsLoading,
  deliveryOpsStoreCode,
  grabCampaignsMeta,
  grabCampaignsRows,
  buildGrabSupportReplyText,
  setGrabCampaignCopiedId,
  grabCampaignCopiedId,
  handleCopyGrabCampaignId,
  grabCampaignCancellingId,
  handleCancelGrabCampaign,
}: PosGrabCampaignsPanelProps) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Megaphone className="h-4 w-4 text-primary" />
          <h4 className="text-xs font-semibold">{t("posGrabCampaignsTitle") || "Grab 캠페인 현황"}</h4>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={() => void handleLoadGrabCampaigns()}
          disabled={grabCampaignsLoading || !deliveryOpsStoreCode}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${grabCampaignsLoading ? "animate-spin" : ""}`} />
          {grabCampaignsLoading ? (t("loading") || "조회 중...") : (t("posGrabCampaignsLoad") || "조회")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {t("posGrabCampaignsHint") ||
          "Grab에 전송된 프로모션 캠페인 목록입니다. Grab이 'Campaign ID'를 요청하면 아래 ID(복사 버튼)를 전달하세요. 0건이면 현재 이 매장에 살아있는 캠페인이 없습니다. 새 프로모가 안 바뀌면 해당 캠페인을 취소한 뒤 다시 조회하세요."}
      </p>
      {grabCampaignsMeta && (
        <p className="text-[11px] text-muted-foreground">
          merchantID: <span className="font-mono">{grabCampaignsMeta.merchantIDs.join(", ") || "-"}</span>
        </p>
      )}
      {grabCampaignsMeta?.campaignsSuppressed && (
        <p className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-950 px-3 py-2 leading-snug">
          {t("posGrabCampaignsSuppressedBanner") ||
            "운영 모드: Grab Campaign API 미사용 — 할인은 메뉴 가격(Menu sync)만 반영. Campaign ID 없음이 정상입니다."}
          {grabCampaignsMeta.consumerListPriceMode
            ? ` (listPrice=${grabCampaignsMeta.consumerListPriceMode})`
            : ""}
        </p>
      )}
      {grabCampaignsRows != null && grabCampaignsRows.length === 0 && (
        <p className="text-xs text-muted-foreground rounded border bg-muted/30 px-3 py-2 leading-snug">
          {grabCampaignsMeta?.hint || (t("posGrabCampaignsEmpty") || "조회된 Grab 캠페인이 없습니다.")}
        </p>
      )}
      {grabCampaignsMeta && (grabCampaignsMeta.erpGrabPromos?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-xs font-semibold">
              {t("posGrabCampaignsErpPromosTitle") || "ERP Grab 프로모 (메뉴 가격 동기화)"}
            </h5>
            <Button
              type="button"
              variant="outline"
              className="h-7 text-[11px] gap-1"
              onClick={async () => {
                const text = buildGrabSupportReplyText()
                try {
                  await navigator.clipboard.writeText(text)
                  setGrabCampaignCopiedId("__grab_reply__")
                  window.setTimeout(
                    () => setGrabCampaignCopiedId((prev) => (prev === "__grab_reply__" ? null : prev)),
                    2000
                  )
                } catch {
                  // ignore
                }
              }}
            >
              <Copy className="h-3 w-3" />
              {grabCampaignCopiedId === "__grab_reply__"
                ? (t("copied") || "복사됨")
                : (t("posGrabCampaignsCopyGrabReply") || "Grab 답변(태국어) 복사")}
            </Button>
          </div>
          <div className="max-h-[280px] overflow-auto border rounded">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b">
                  <th className="p-2 text-left">{t("posGrabCampaignName") || "캠페인"}</th>
                  <th className="p-2 text-left">{t("posGrabCampaignErpRef") || "참조명"}</th>
                  <th className="p-2 text-left">Grab item ID</th>
                  <th className="p-2 text-right w-24">{t("posGrabCampaignDiscount") || "할인"}</th>
                </tr>
              </thead>
              <tbody>
                {grabCampaignsMeta.erpGrabPromos.map((p) => (
                  <tr key={p.promoId} className="border-b last:border-b-0">
                    <td className="p-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-muted-foreground">#{p.promoId}</div>
                    </td>
                    <td className="p-2 font-mono text-[11px]">{p.campaignNameRef}</td>
                    <td className="p-2 font-mono text-[11px] break-all">{p.grabMenuItemId}</td>
                    <td className="p-2 text-right tabular-nums">
                      ฿{p.salePrice}
                      {p.regularPrice > p.salePrice ? (
                        <div className="text-muted-foreground line-through text-[10px]">฿{p.regularPrice}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {grabCampaignsRows != null && grabCampaignsRows.length > 0 && (
          <div className="max-h-[360px] overflow-auto border rounded">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b">
                  <th className="p-2 text-left">{t("posGrabCampaignName") || "캠페인"}</th>
                  <th className="p-2 text-left w-64">Campaign ID</th>
                  <th className="p-2 text-center w-20">{t("posGrabCampaignState") || "상태"}</th>
                  <th className="p-2 text-center w-24">{t("posGrabCampaignDiscount") || "할인"}</th>
                  <th className="p-2 text-left w-44">{t("posGrabCampaignPeriod") || "기간(BKK)"}</th>
                  <th className="p-2 text-right w-24">{t("posGrabCampaignCancel") || "취소"}</th>
                </tr>
              </thead>
              <tbody>
                {grabCampaignsRows.map((c) => (
                  <tr key={`${c.merchantID}-${c.id}`} className="border-b last:border-b-0 align-top">
                    <td className="p-2">
                      <div className="font-medium break-all">{c.name}</div>
                      <div className="text-muted-foreground break-all">{c.itemIds.join(", ") || "-"}</div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono break-all">{c.id}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 shrink-0"
                          onClick={() => void handleCopyGrabCampaignId(c.id)}
                        >
                          <Copy className="h-3 w-3" />
                          <span className="ml-1 text-[10px]">
                            {grabCampaignCopiedId === c.id ? (t("copied") || "복사됨") : (t("copy") || "복사")}
                          </span>
                        </Button>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <span className={c.section === "ongoing" ? "text-emerald-600 font-medium" : "text-amber-600"}>
                        {c.section === "ongoing"
                          ? (t("posGrabCampaignOngoing") || "진행중")
                          : (t("posGrabCampaignUpcoming") || "예정")}
                      </span>
                    </td>
                    <td className="p-2 text-center tabular-nums">
                      {c.discountType === "percentage"
                        ? `${c.discountValue}%`
                        : c.discountType === "fixPrice"
                          ? `฿${c.discountValue}`
                          : `${c.discountType || "-"} ${c.discountValue || ""}`}
                    </td>
                    <td className="p-2 text-[11px] leading-snug">
                      <div>{c.startTimeBkk || c.startTimeUtc || "-"}</div>
                      <div className="text-muted-foreground">~ {c.endTimeBkk || c.endTimeUtc || "-"}</div>
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={`${ADMIN_BTN_XS_CN} text-[11px] text-destructive`}
                        disabled={
                          grabCampaignsLoading ||
                          grabCampaignCancellingId === `${c.merchantID}:${c.id}`
                        }
                        onClick={() => void handleCancelGrabCampaign(c)}
                      >
                        {grabCampaignCancellingId === `${c.merchantID}:${c.id}`
                          ? (t("loading") || "처리 중...")
                          : (t("posGrabCampaignCancel") || "취소")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      )}
    </div>
  )
}
