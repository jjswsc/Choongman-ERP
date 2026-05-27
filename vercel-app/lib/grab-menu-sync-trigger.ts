import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
import { syncGrabPromoTargetPriceCampaigns } from '@/lib/grab-promo-target-price-campaign'
import {
  collectGrabPartnerStoreIds,
  isGrabFoodMerchantMapKey,
} from '@/lib/grab-resolve-menu-notification-merchants'
import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type TriggerParams = {
  reason: string
  partnerMerchantID?: string | null
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
    if (merchantID && isGrabFoodMerchantMapKey(merchantID)) out.add(merchantID)
  }
  if (out.size > 0) return Array.from(out)

  const map = parseGrabStoreMap()
  const partnerRaw = String(partnerMerchantID ?? '').trim()

  if (partnerRaw) {
    const partnerIds = collectGrabPartnerStoreIds(partnerRaw, map)
    for (const pid of partnerIds) {
      for (const [grabMerchantID, mappedStore] of Object.entries(map)) {
        if (!isGrabFoodMerchantMapKey(grabMerchantID)) continue
        if (String(mappedStore).trim() === pid) out.add(grabMerchantID)
      }
    }
    return Array.from(out)
  }

  for (const grabMerchantID of Object.keys(map)) {
    if (isGrabFoodMerchantMapKey(grabMerchantID)) out.add(grabMerchantID)
  }
  return Array.from(out)
}

export async function triggerGrabMenuNotification(params: TriggerParams): Promise<{
  attempted: number
  sent: number
  failed: number
}> {
  const merchants = await loadActiveGrabMerchants(params.partnerMerchantID)
  let sent = 0
  let failed = 0
  for (const merchantID of merchants) {
    try {
      await grabUpdateMenuNotification(merchantID)
      sent += 1
      console.info('[grab-menu-sync] notification_sent', {
        merchantID,
        reason: params.reason,
      })
      void syncGrabPromoTargetPriceCampaigns({ merchantID })
        .then((r) => {
          console.info('[grab-menu-sync] promo_target_price_campaigns', {
            merchantID,
            reason: params.reason,
            ...r,
          })
        })
        .catch((e) => {
          console.warn('[grab-menu-sync] promo_target_price_campaigns_failed', {
            merchantID,
            reason: params.reason,
            error: String(e),
          })
        })
    } catch (e) {
      failed += 1
      console.error('[grab-menu-sync] notification_failed', {
        merchantID,
        reason: params.reason,
        error: String(e ?? 'unknown'),
      })
    }
  }
  return { attempted: merchants.length, sent, failed }
}
