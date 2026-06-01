import { NextRequest, NextResponse } from 'next/server'
import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
import { parseGrabMenuNotificationMerchantBulkInput } from '@/lib/grab-menu-notification-input-parse'
import { syncGrabPromoTargetPriceCampaigns } from '@/lib/grab-promo-target-price-campaign'
import {
  listAllGrabFoodMerchantIdsFromStoreMap,
  resolveGrabMenuNotificationMerchantIDs,
} from '@/lib/grab-resolve-menu-notification-merchants'

type UpdateMenuNotificationBody = {
  /**
   * 단일 값이거나, 쉼표로 구분한 여러 값(예: `GFSBPOS-a,GFSBPOS-b`).
   * JSON은 같은 키를 두 번 쓸 수 없으므로 여러 개는 쉼표 또는 `merchantIDs` 배열을 사용.
   */
  merchantID?: string
  /** 여러 매장·코드 한 번에 (각 항목은 `merchantID`와 동일 규칙으로 해석·중복 제거 후 Grab 호출) */
  merchantIDs?: unknown
  /** true면 `GRAB_STORE_MAP_JSON`의 모든 `GFSBPOS-…` 키에 대해 호출 */
  all?: unknown
  /**
   * true면 메뉴 알림 후 Grab fixPrice 캠페인(컷프라이스용)도 즉시 동기화.
   * menu-sync-state 웹훅 누락/지연 시 운영 우회용.
   */
  syncPromoTargetPriceCampaigns?: unknown
  /** true면 fixPrice→percentage 할인 타입 마이그레이션(PUT, ongoing 시작 시각 유지) */
  migratePromoCampaignToPercentage?: unknown
  /** true면 fixPrice 캠페인을 삭제·재생성(startTime이 now+65분으로 리셋 → Simulator "Now" 취소선 사라짐) */
  forcePromoCampaignResync?: unknown
  /** true(기본): 모든 활성 Grab 세트·프로모 컷프라이스 즉시 반영 */
  immediatePromoDisplay?: unknown
  /** 캠페인 시작 리드타임(분). immediate면 기본 5 */
  campaignStartLeadMinutes?: unknown
}

function coerceMerchantIdInputs(body: UpdateMenuNotificationBody): string[] {
  if (body.all === true || body.all === 'true' || body.all === 1) {
    return listAllGrabFoodMerchantIdsFromStoreMap()
  }
  const arr = body.merchantIDs
  if (Array.isArray(arr)) {
    return arr.map((x) => String(x ?? '').trim()).filter(Boolean)
  }
  const single = String(body.merchantID || '').trim()
  if (!single) return []
  return parseGrabMenuNotificationMerchantBulkInput(single)
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as UpdateMenuNotificationBody
    const rawInputs = coerceMerchantIdInputs(body)
    if (rawInputs.length === 0) {
      return NextResponse.json(
        { success: false, message: 'merchantID_or_merchantIDs_or_all_required' },
        { status: 400, headers }
      )
    }

    const toNotify = new Set<string>()
    const unresolvedInputs: string[] = []
    for (const raw of rawInputs) {
      const resolved = resolveGrabMenuNotificationMerchantIDs(raw)
      if (!resolved.length) unresolvedInputs.push(raw)
      else resolved.forEach((id) => toNotify.add(id))
    }

    if (toNotify.size === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'grab_menu_notification_merchant_unresolved',
          unresolvedInputs,
        },
        { status: 400, headers }
      )
    }

    const failures: { merchantID: string; message: string }[] = []
    for (const merchantID of toNotify) {
      try {
        await grabUpdateMenuNotification(merchantID)
      } catch (e) {
        failures.push({ merchantID, message: String(e) })
      }
    }

    const failedSet = new Set(failures.map((f) => f.merchantID))
    const succeededMerchantIDs = Array.from(toNotify).filter((id) => !failedSet.has(id))
    /** Partner API 대상 중 하나라도 성공하면 200 (포털 ID 404 등 부분 실패 허용) */
    const success = succeededMerchantIDs.length > 0
    const shouldSyncPromoCampaigns =
      body.syncPromoTargetPriceCampaigns === true ||
      body.syncPromoTargetPriceCampaigns === 'true' ||
      body.syncPromoTargetPriceCampaigns === 1
    const migratePromoCampaignToPercentage =
      body.migratePromoCampaignToPercentage === true ||
      body.migratePromoCampaignToPercentage === 'true' ||
      body.migratePromoCampaignToPercentage === 1
    const forcePromoCampaignResync =
      body.forcePromoCampaignResync === true ||
      body.forcePromoCampaignResync === 'true' ||
      body.forcePromoCampaignResync === 1
    const immediatePromoDisplay =
      body.immediatePromoDisplay !== false &&
      body.immediatePromoDisplay !== 'false' &&
      body.immediatePromoDisplay !== 0
    const campaignStartLeadRaw = body.campaignStartLeadMinutes
    const campaignStartLeadMinutes =
      campaignStartLeadRaw != null && campaignStartLeadRaw !== ''
        ? Number(campaignStartLeadRaw)
        : undefined
    const promoCampaignSyncResults: Record<
      string,
      | {
          created: number
          updated: number
          skipped: number
          deleted: number
          targets: number
          menuRecordsPushed?: number
          menuRecordsFailed?: number
          campaignErrors?: Array<{ promoId: number; grabItemId: string; error: string; errorCode?: string }>
          campaignFallbackUsed?: number
        }
      | { error: string }
    > = {}
    const menuNotificationAfterCampaignSync: string[] = []
    const menuNotificationAfterCampaignSyncFailures: { merchantID: string; message: string }[] = []
    if (shouldSyncPromoCampaigns && succeededMerchantIDs.length > 0) {
      for (const merchantID of succeededMerchantIDs) {
        try {
          promoCampaignSyncResults[merchantID] = await syncGrabPromoTargetPriceCampaigns({
            merchantID,
            force: forcePromoCampaignResync,
            immediatePromoDisplay,
            ...(migratePromoCampaignToPercentage
              ? {
                  migrateDiscountType: true,
                  campaignDiscountType: 'percentage' as const,
                }
              : {}),
            ...(Number.isFinite(campaignStartLeadMinutes)
              ? { campaignStartLeadMinutes: campaignStartLeadMinutes as number }
              : {}),
          })
        } catch (e) {
          promoCampaignSyncResults[merchantID] = { error: String(e ?? 'unknown_error') }
        }
      }
      /** 캠페인 생성·갱신 후 Grab이 메뉴를 다시 pull 해야 컷프라이스(정가+할인가)가 붙는다 */
      for (const merchantID of succeededMerchantIDs) {
        const promoResult = promoCampaignSyncResults[merchantID]
        if (promoResult && 'error' in promoResult) continue
        try {
          await grabUpdateMenuNotification(merchantID)
          menuNotificationAfterCampaignSync.push(merchantID)
        } catch (e) {
          menuNotificationAfterCampaignSyncFailures.push({
            merchantID,
            message: String(e),
          })
        }
      }
    }
    return NextResponse.json(
      {
        success,
        notifiedMerchantIDs: Array.from(toNotify),
        ...(failures.length ? { succeededMerchantIDs } : {}),
        ...(unresolvedInputs.length ? { unresolvedInputs } : {}),
        ...(failures.length ? { failures } : {}),
        ...(shouldSyncPromoCampaigns ? { promoCampaignSyncResults } : {}),
        ...(menuNotificationAfterCampaignSync.length
          ? { menuNotificationAfterCampaignSync }
          : {}),
        ...(menuNotificationAfterCampaignSyncFailures.length
          ? { menuNotificationAfterCampaignSyncFailures }
          : {}),
      },
      { status: success ? 200 : 500, headers }
    )
  } catch (e) {
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

