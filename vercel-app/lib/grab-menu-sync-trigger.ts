import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
import { syncGrabPromoTargetPriceCampaigns } from '@/lib/grab-promo-target-price-campaign'
import {
  isGrabMenuSyncMerchantId,
  resolveGrabMenuNotificationMerchantIDs,
} from '@/lib/grab-resolve-menu-notification-merchants'
import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type TriggerParams = {
  reason: string
  partnerMerchantID?: string | null
  /** true면 메뉴 알림 성공 직후 fixPrice 캠페인(컷프라이스) 동기화 */
  syncPromoTargetPriceCampaigns?: boolean
}

/** underscore 구분 reason(`save_pos_promo`) — JS `\bpromo\b`는 `_`를 word char로 취급해 매칭 실패 */
function isPromoMenuSyncReason(reason: string): boolean {
  return String(reason || '')
    .toLowerCase()
    .split('_')
    .includes('promo')
}

type IntegrationRow = {
  grab_merchant_id?: string
  partner_merchant_id?: string
  integration_status?: string
}

async function loadActiveGrabMerchants(partnerMerchantID?: string | null): Promise<string[]> {
  const filters = ['id=gt.0']
  if (partnerMerchantID) {
    filters.push(`partner_merchant_id=eq.${encodeURIComponent(String(partnerMerchantID).trim())}`)
  }
  const rows = (await supabaseSelectFilter('pos_grab_store_integrations', filters.join('&'), {
    limit: 1000,
    select: 'grab_merchant_id,partner_merchant_id,integration_status',
    order: 'updated_at.desc',
  }).catch(() => [])) as IntegrationRow[] | null

  const out = new Set<string>()
  for (const row of rows || []) {
    const status = String(row.integration_status ?? '').trim().toUpperCase()
    if (status !== 'ACTIVE' && status !== 'SYNCING') continue
    const merchantID = String(row.grab_merchant_id ?? '').trim()
    if (!merchantID) continue
    for (const id of resolveGrabMenuNotificationMerchantIDs(merchantID)) out.add(id)
  }
  if (out.size > 0) return Array.from(out).sort()

  const map = parseGrabStoreMap()
  const partnerRaw = String(partnerMerchantID ?? '').trim()

  if (partnerRaw) {
    return resolveGrabMenuNotificationMerchantIDs(partnerRaw)
  }

  for (const grabMerchantID of Object.keys(map)) {
    if (isGrabMenuSyncMerchantId(grabMerchantID)) out.add(grabMerchantID)
  }
  return Array.from(out).sort()
}

export async function triggerGrabMenuNotification(params: TriggerParams): Promise<{
  attempted: number
  sent: number
  failed: number
  promoCampaignSynced: number
  promoCampaignSyncFailed: number
}> {
  const merchants = await loadActiveGrabMerchants(params.partnerMerchantID)
  let sent = 0
  let failed = 0
  let promoCampaignSynced = 0
  let promoCampaignSyncFailed = 0
  const shouldSyncPromoCampaigns =
    params.syncPromoTargetPriceCampaigns === true || isPromoMenuSyncReason(params.reason)
  for (const merchantID of merchants) {
    try {
      await grabUpdateMenuNotification(merchantID)
      sent += 1
      console.info('[grab-menu-sync] notification_sent', {
        merchantID,
        reason: params.reason,
      })
      if (shouldSyncPromoCampaigns) {
        try {
          const result = await syncGrabPromoTargetPriceCampaigns({
            merchantID,
            immediatePromoDisplay: true,
          })
          promoCampaignSynced += 1
          console.info('[grab-menu-sync] promo_target_price_campaigns', {
            merchantID,
            reason: params.reason,
            ...result,
          })
          /** 캠페인 반영 후 메뉴 재알림 — Grab 앱 컷프라이스 표시용 */
          await grabUpdateMenuNotification(merchantID)
          console.info('[grab-menu-sync] notification_sent_after_promo_campaigns', {
            merchantID,
            reason: params.reason,
          })
        } catch (e) {
          promoCampaignSyncFailed += 1
          console.error('[grab-menu-sync] promo_target_price_campaigns_failed', {
            merchantID,
            reason: params.reason,
            error: String(e ?? 'unknown'),
          })
        }
      }
    } catch (e) {
      failed += 1
      console.error('[grab-menu-sync] notification_failed', {
        merchantID,
        reason: params.reason,
        error: String(e ?? 'unknown'),
      })
    }
  }
  return { attempted: merchants.length, sent, failed, promoCampaignSynced, promoCampaignSyncFailed }
}
