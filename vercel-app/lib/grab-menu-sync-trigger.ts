import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
import { syncGrabPromoTargetPriceCampaigns } from '@/lib/grab-promo-target-price-campaign'
import {
  isGrabMenuSyncMerchantId,
  listAllGrabPortalMerchantIdsFromEnv,
  resolveGrabMenuNotificationMerchantIDs,
} from '@/lib/grab-resolve-menu-notification-merchants'
import {
  listGrabPartnerStoreCodesFromPortalMap,
  parseGrabStoreMap,
} from '@/lib/grab-store-map-env'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** Grab menu notification 연속 호출 시 409 완화(초) */
const GRAB_MENU_SYNC_INTER_STORE_DELAY_MS = 2000

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

  const partnerRaw = String(partnerMerchantID ?? '').trim()
  if (partnerRaw) {
    for (const id of resolveGrabMenuNotificationMerchantIDs(partnerRaw)) out.add(id)
    return Array.from(out).sort()
  }

  /** ERP 프로모·컷프라이스는 매장 공통 — 포털 맵(1040/1042/1043) 전부 포함 */
  for (const id of listAllGrabPortalMerchantIdsFromEnv()) out.add(id)

  if (out.size === 0) {
    const map = parseGrabStoreMap()
    for (const grabMerchantID of Object.keys(map)) {
      if (isGrabMenuSyncMerchantId(grabMerchantID)) out.add(grabMerchantID)
    }
  }
  return Array.from(out).sort()
}

export function normalizeGrabMenuSyncStoreCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const code = String(v ?? '').trim()
    if (!code) continue
    if (out.some((x) => x.toLowerCase() === code.toLowerCase())) continue
    out.push(code)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

/** 메뉴 노출 매장·요청 storeCodes → Grab sync 대상 매장 코드 */
export async function resolveMenuStoreCodesForGrabSync(params: {
  menuId?: string | null
  bodyStoreCodes?: unknown
  bodyStoreCode?: unknown
}): Promise<string[]> {
  const fromBody = normalizeGrabMenuSyncStoreCodes(params.bodyStoreCodes)
  if (fromBody.length > 0) return fromBody
  const single = String(params.bodyStoreCode ?? '').trim()
  if (single) return [single]
  const menuId = String(params.menuId ?? '').trim()
  if (menuId) {
    try {
      const rows = (await supabaseSelectFilter(
        'pos_menu_store_scopes',
        `menu_id=eq.${encodeURIComponent(menuId)}&enabled=eq.true`,
        { limit: 1000, select: 'store_code' }
      )) as { store_code?: string | null }[] | null
      const fromScope = normalizeGrabMenuSyncStoreCodes(
        (rows || []).map((r) => String(r.store_code ?? '').trim()).filter(Boolean)
      )
      if (fromScope.length > 0) return fromScope
    } catch (e) {
      console.warn('[grab-menu-sync] menu_store_scope_lookup_failed', { menuId, error: String(e) })
    }
  }
  return listGrabPartnerStoreCodesFromPortalMap()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 매장별 Grab menu notification — 설명·메뉴 저장 시 409·미반영 완화 */
export async function triggerGrabMenuNotificationPerStoreCodes(
  params: TriggerParams & { storeCodes?: string[] }
): Promise<{
  attempted: number
  sent: number
  failed: number
  promoCampaignSynced: number
  promoCampaignSyncFailed: number
  storeCodes: string[]
}> {
  const explicit = normalizeGrabMenuSyncStoreCodes(params.storeCodes)
  const legacy = String(params.partnerMerchantID ?? '').trim()
  const targets =
    explicit.length > 0 ? explicit : legacy ? [legacy] : listGrabPartnerStoreCodesFromPortalMap()

  if (targets.length <= 1) {
    const r = await triggerGrabMenuNotification({
      reason: params.reason,
      partnerMerchantID: targets[0] ?? params.partnerMerchantID ?? null,
      syncPromoTargetPriceCampaigns: params.syncPromoTargetPriceCampaigns,
    })
    return { ...r, storeCodes: targets }
  }

  let attempted = 0
  let sent = 0
  let failed = 0
  let promoCampaignSynced = 0
  let promoCampaignSyncFailed = 0
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await sleep(GRAB_MENU_SYNC_INTER_STORE_DELAY_MS)
    const r = await triggerGrabMenuNotification({
      reason: params.reason,
      partnerMerchantID: targets[i],
      syncPromoTargetPriceCampaigns: params.syncPromoTargetPriceCampaigns,
    })
    attempted += r.attempted
    sent += r.sent
    failed += r.failed
    promoCampaignSynced += r.promoCampaignSynced
    promoCampaignSyncFailed += r.promoCampaignSyncFailed
  }
  console.info('[grab-menu-sync] per_store_notifications_done', {
    reason: params.reason,
    storeCodes: targets,
    attempted,
    sent,
    failed,
  })
  return {
    attempted,
    sent,
    failed,
    promoCampaignSynced,
    promoCampaignSyncFailed,
    storeCodes: targets,
  }
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
