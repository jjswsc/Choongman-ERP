import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
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

/** Grab merchantID 키만 (GFSBPOS-…). JSON에 넣은 파트너 숫자·ERP 코드 키는 제외 */
function isGrabFoodMerchantMapKey(k: string): boolean {
  const s = String(k || '').trim()
  if (!s) return false
  if (/^\d{1,6}$/.test(s)) return false
  return /GF/i.test(s)
}

/** Grab 파트너 스토어 ID(숫자 문자열) 후보 — ERP store_code·표시명도 입력될 수 있음 */
function collectGrabPartnerStoreIds(partnerParam: string, map: Record<string, string>): Set<string> {
  const raw = String(partnerParam || '').trim()
  const ids = new Set<string>()
  if (!raw) return ids
  if (/^\d{1,6}$/.test(raw)) ids.add(raw)
  for (const [k, v] of Object.entries(map)) {
    const kk = String(k || '').trim()
    const vv = String(v || '').trim()
    if (!kk || !vv) continue
    // "000":"HQ" → ERP 코드 HQ 일 때 파트너 000
    if (/^\d{1,6}$/.test(kk) && vv === raw) ids.add(kk)
  }
  return ids
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
