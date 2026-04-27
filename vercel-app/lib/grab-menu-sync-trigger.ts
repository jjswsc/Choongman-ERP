import { grabUpdateMenuNotification } from '@/lib/grab-partner-api'
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

function parseGrabStoreMap(): Record<string, string> {
  const raw = process.env.GRAB_STORE_MAP_JSON?.trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const key = String(k || '').trim()
      const val = String(v || '').trim()
      if (key && val) out[key] = val
    }
    return out
  } catch {
    return {}
  }
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
    if (merchantID) out.add(merchantID)
  }
  if (out.size > 0) return Array.from(out)

  const map = parseGrabStoreMap()
  if (partnerMerchantID) {
    for (const [grabMerchantID, mappedStore] of Object.entries(map)) {
      if (String(mappedStore).trim() === String(partnerMerchantID).trim()) out.add(grabMerchantID)
    }
  } else {
    for (const grabMerchantID of Object.keys(map)) out.add(grabMerchantID)
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
