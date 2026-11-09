import 'server-only'

import { buildGrabMenuItemId } from '@/lib/grab-menu-item-id'
import {
  grabAvailabilityAction,
  grabAvailabilityStateKey,
  grabItemAvailabilityStatus,
  hasGrabDailySellWindow,
  isGrabItemMissingError,
  parseGrabAvailabilityRecord,
  selectGrabAvailabilityWork,
  type GrabAvailabilityRecord,
  type GrabItemAvailability,
} from '@/lib/grab-menu-availability'
import { grabUpdateMenuRecord } from '@/lib/grab-partner-api'
import {
  isGrabPortalMerchantMapKey,
  resolveGrabMenuNotificationMerchantIDsForStore,
} from '@/lib/grab-resolve-menu-notification-merchants'
import { triggerGrabMenuNotificationPerStoreCodes } from '@/lib/grab-menu-sync-trigger'
import {
  type PosDeliveryMenuPolicy,
} from '@/lib/pos-delivery-policy'
import { supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpsert } from '@/lib/supabase-server'

/** 한 cron 실행에서 Grab PUT 상한. 나머지는 다음 5분에 이어서 보낸다. */
const CRON_PUSH_CAP = 60
const PUT_GAP_MS = 40

export type GrabDeliverySyncResult = {
  notificationSent: number
  notificationFailed: number
  itemsUpdated: number
  itemsFailed: number
  itemErrors: string[]
}

type MenuMeta = {
  code: string
  active: boolean
  sellDelivery: boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errText(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return msg.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function rowToPolicy(row: Record<string, unknown>): PosDeliveryMenuPolicy {
  const stockRaw = row.stock_qty
  const stock =
    stockRaw == null || stockRaw === ''
      ? null
      : Number.isFinite(Number(stockRaw))
        ? Number(stockRaw)
        : null
  return {
    storeCode: String(row.store_code ?? '').trim(),
    appCode: 'grab',
    menuId: Math.trunc(Number(row.menu_id) || 0),
    enabled: row.enabled == null ? true : Boolean(row.enabled),
    sortOrder: Math.trunc(Number(row.sort_order) || 0),
    sellStartTime: row.sell_start_time == null ? null : String(row.sell_start_time),
    sellEndTime: row.sell_end_time == null ? null : String(row.sell_end_time),
    stockQty: stock,
    soldOut: Boolean(row.sold_out ?? false),
    autoStopOnZero: row.auto_stop_on_zero == null ? true : Boolean(row.auto_stop_on_zero),
  }
}

export async function loadGrabMenuPoliciesForStore(storeCode: string): Promise<PosDeliveryMenuPolicy[]> {
  const code = String(storeCode || '').trim()
  if (!code) return []
  const rows = (await supabaseSelectFilter(
    'pos_delivery_menu_policies',
    `store_code=eq.${encodeURIComponent(code)}&app_code=eq.grab`,
    {
      limit: 5000,
      select:
        'store_code,menu_id,enabled,sort_order,sell_start_time,sell_end_time,stock_qty,sold_out,auto_stop_on_zero',
    }
  ).catch(() => [])) as Record<string, unknown>[] | null
  return (rows || []).map(rowToPolicy).filter((row) => row.menuId > 0)
}

async function loadAllGrabMenuPolicies(): Promise<PosDeliveryMenuPolicy[]> {
  const rows = (await supabaseSelectFilterAllPages(
    'pos_delivery_menu_policies',
    'app_code=eq.grab',
    {
      order: 'store_code.asc,menu_id.asc',
      select:
        'store_code,menu_id,enabled,sort_order,sell_start_time,sell_end_time,stock_qty,sold_out,auto_stop_on_zero',
      pageSize: 1000,
    }
  )) as Record<string, unknown>[]
  return rows.map(rowToPolicy).filter((row) => row.menuId > 0 && row.storeCode)
}

async function readRecords(storeCode: string): Promise<Record<string, GrabAvailabilityRecord>> {
  const key = grabAvailabilityStateKey(storeCode)
  try {
    const rows = (await supabaseSelectFilter(
      'system_settings',
      `key=eq.${encodeURIComponent(key)}`,
      { limit: 1, select: 'value_json' }
    )) as { value_json?: unknown }[] | null
    const raw = rows?.[0]?.value_json
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, GrabAvailabilityRecord> = {}
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const rec = parseGrabAvailabilityRecord(value)
      if (rec) out[id] = rec
    }
    return out
  } catch (error) {
    console.warn('[grab-item-availability] state_read_failed', { storeCode, error: errText(error) })
    return {}
  }
}

async function writeRecords(
  storeCode: string,
  records: Record<string, GrabAvailabilityRecord>
): Promise<void> {
  const key = grabAvailabilityStateKey(storeCode)
  await supabaseUpsert(
    'system_settings',
    [
      {
        key,
        value_json: records,
        updated_at: new Date().toISOString(),
      },
    ],
    'key'
  )
}

async function merchantIdsForStore(storeCode: string): Promise<string[]> {
  const ids = await resolveGrabMenuNotificationMerchantIDsForStore(storeCode)
  const portal = ids.filter((id) => isGrabPortalMerchantMapKey(id))
  return portal.length > 0 ? portal : ids
}

async function loadMenuMeta(menuIds: number[]): Promise<Map<number, MenuMeta>> {
  const ids = [...new Set(menuIds.filter((id) => id > 0))]
  const map = new Map<number, MenuMeta>()
  let includeChannel = true
  for (let i = 0; i < ids.length; i += 120) {
    const part = ids.slice(i, i + 120)
    const filter = `id=in.(${part.join(',')})`
    let rows: Record<string, unknown>[] = []
    if (includeChannel) {
      try {
        rows = (await supabaseSelectFilter('pos_menus', filter, {
          limit: part.length,
          select: 'id,code,is_active,sell_delivery',
        })) as Record<string, unknown>[]
      } catch {
        includeChannel = false
      }
    }
    if (!includeChannel) {
      rows = (await supabaseSelectFilter('pos_menus', filter, {
        limit: part.length,
        select: 'id,code',
      }).catch(() => [])) as Record<string, unknown>[]
    }
    for (const row of rows || []) {
      const id = Math.trunc(Number(row.id) || 0)
      if (id <= 0) continue
      map.set(id, {
        code: String(row.code ?? ''),
        active: includeChannel ? row.is_active !== false : true,
        sellDelivery: includeChannel ? row.sell_delivery !== false : true,
      })
    }
  }
  return map
}

async function pushGrabItemAvailabilityForStore(params: {
  storeCode: string
  push: Array<{ menuId: number; desired: GrabItemAvailability }>
  remember: Array<{ menuId: number; desired: GrabItemAvailability }>
  records: Record<string, GrabAvailabilityRecord>
}): Promise<{ updated: number; failed: number; errors: string[] }> {
  const { storeCode, records } = params
  let updated = 0
  let failed = 0
  const errors: string[] = []
  const nextRecords: Record<string, GrabAvailabilityRecord> = { ...records }
  let dirty = false

  for (const item of params.remember) {
    const key = String(item.menuId)
    const prev = nextRecords[key]
    if (!prev || prev.status !== item.desired || !prev.ok) {
      nextRecords[key] = { status: item.desired, ok: true, at: new Date().toISOString() }
      dirty = true
    }
  }

  if (params.push.length > 0) {
    const merchantIDs = await merchantIdsForStore(storeCode)
    const meta = await loadMenuMeta(params.push.map((item) => item.menuId))
    if (merchantIDs.length === 0) {
      failed += params.push.length
      errors.push('grab_merchant_unresolved')
      console.error('[grab-item-availability] merchant_unresolved', {
        storeCode,
        items: params.push.length,
      })
    } else {
      for (let i = 0; i < params.push.length; i++) {
        if (i > 0) await sleep(PUT_GAP_MS)
        const item = params.push[i]
        const key = String(item.menuId)
        const menu = meta.get(item.menuId)
        const stamped = new Date().toISOString()
        if (menu && (!menu.active || !menu.sellDelivery)) {
          nextRecords[key] = { status: item.desired, ok: true, at: stamped }
          dirty = true
          continue
        }
        const itemId = buildGrabMenuItemId(
          { id: item.menuId, code: menu?.code || '' },
          0
        )
        let hardFail = ''
        let missing = false
        for (const merchantID of merchantIDs) {
          try {
            await grabUpdateMenuRecord({
              merchantID,
              field: 'ITEM',
              id: itemId,
              availableStatus: item.desired,
              ...(item.desired === 'UNAVAILABLE' ? { maxStock: 0 } : {}),
            })
          } catch (error) {
            if (isGrabItemMissingError(error)) {
              missing = true
              hardFail = errText(error)
              break
            }
            hardFail = errText(error)
            break
          }
        }
        if (!hardFail) {
          updated += 1
          nextRecords[key] = { status: item.desired, ok: true, at: new Date().toISOString() }
          dirty = true
          console.info('[grab-item-availability] item_updated', {
            storeCode,
            menuId: item.menuId,
            itemId,
            availableStatus: item.desired,
          })
          continue
        }
        if (missing) {
          failed += 1
          nextRecords[key] = { status: item.desired, ok: true, at: new Date().toISOString() }
          dirty = true
          if (errors.length < 5) errors.push(`${itemId}: ${hardFail}`)
          console.warn('[grab-item-availability] item_missing', {
            storeCode,
            menuId: item.menuId,
            itemId,
            error: hardFail,
          })
          continue
        }
        failed += 1
        nextRecords[key] = { status: item.desired, ok: false, at: new Date().toISOString() }
        dirty = true
        if (errors.length < 5) errors.push(`${itemId}: ${hardFail}`)
        console.error('[grab-item-availability] item_update_failed', {
          storeCode,
          menuId: item.menuId,
          itemId,
          error: hardFail,
        })
      }
    }
  }

  if (dirty) {
    try {
      await writeRecords(storeCode, nextRecords)
    } catch (error) {
      console.error('[grab-item-availability] state_write_failed', {
        storeCode,
        error: errText(error),
      })
    }
  }

  return { updated, failed, errors }
}

export async function syncGrabDeliveryPolicySave(params: {
  storeCode: string
  previous: PosDeliveryMenuPolicy[]
  next: PosDeliveryMenuPolicy[] | null
}): Promise<GrabDeliverySyncResult> {
  const storeCode = String(params.storeCode || '').trim()
  let itemsUpdated = 0
  let itemsFailed = 0
  const itemErrors: string[] = []

  if (storeCode && Array.isArray(params.next)) {
    const records = await readRecords(storeCode)
    const work = selectGrabAvailabilityWork({
      previous: params.previous,
      next: params.next,
      records,
    })
    const pushed = await pushGrabItemAvailabilityForStore({
      storeCode,
      push: work.push,
      remember: work.remember,
      records,
    })
    itemsUpdated = pushed.updated
    itemsFailed = pushed.failed
    itemErrors.push(...pushed.errors)
  }

  let notificationSent = 0
  let notificationFailed = 0
  try {
    const notified = await triggerGrabMenuNotificationPerStoreCodes({
      reason: 'delivery_policy_updated',
      storeCodes: [storeCode],
      partnerMerchantID: storeCode,
      syncPromoTargetPriceCampaigns: true,
    })
    notificationSent = notified.sent
    notificationFailed = notified.failed
  } catch (error) {
    notificationFailed += 1
    console.error('[grab-item-availability] notification_failed', {
      storeCode,
      error: errText(error),
    })
  }

  return {
    notificationSent,
    notificationFailed,
    itemsUpdated,
    itemsFailed,
    itemErrors,
  }
}

function cronWorkForStore(
  policies: PosDeliveryMenuPolicy[],
  records: Record<string, GrabAvailabilityRecord>,
  now: Date
): {
  push: Array<{ menuId: number; desired: GrabItemAvailability }>
  remember: Array<{ menuId: number; desired: GrabItemAvailability }>
} {
  const byId = new Map<number, PosDeliveryMenuPolicy>()
  for (const policy of policies) {
    if (policy.menuId > 0) byId.set(policy.menuId, policy)
  }
  const ids = new Set<number>(byId.keys())
  for (const key of Object.keys(records)) {
    const id = Math.trunc(Number(key) || 0)
    if (id > 0) ids.add(id)
  }
  const push: Array<{ menuId: number; desired: GrabItemAvailability }> = []
  const remember: Array<{ menuId: number; desired: GrabItemAvailability }> = []
  for (const menuId of ids) {
    const policy = byId.get(menuId)
    const desired = grabItemAvailabilityStatus(policy, now)
    const record = records[String(menuId)] ?? null
    const relevant = policy
      ? hasGrabDailySellWindow(policy) || policy.soldOut || record != null
      : record != null
    if (!relevant) continue
    const action = grabAvailabilityAction({ desired, record, now, retryFailed: false })
    if (action === 'push') push.push({ menuId, desired })
    else if (action === 'remember-available') remember.push({ menuId, desired })
  }
  return { push, remember }
}

export async function runGrabMenuAvailabilityCron(now = new Date()): Promise<{
  stores: number
  itemsUpdated: number
  itemsFailed: number
  itemsDeferred: number
  itemErrors: string[]
}> {
  const policies = await loadAllGrabMenuPolicies()
  const byStore = new Map<string, PosDeliveryMenuPolicy[]>()
  for (const policy of policies) {
    const list = byStore.get(policy.storeCode) || []
    list.push(policy)
    byStore.set(policy.storeCode, list)
  }
  const storeCodes = [...byStore.keys()].sort((a, b) => a.localeCompare(b))
  let itemsUpdated = 0
  let itemsFailed = 0
  let itemsDeferred = 0
  const itemErrors: string[] = []
  let budget = CRON_PUSH_CAP

  for (const storeCode of storeCodes) {
    const records = await readRecords(storeCode)
    const work = cronWorkForStore(byStore.get(storeCode) || [], records, now)
    const batch = work.push.slice(0, Math.max(0, budget))
    itemsDeferred += Math.max(0, work.push.length - batch.length)
    budget -= batch.length
    if (batch.length === 0 && work.remember.length === 0) continue
    const pushed = await pushGrabItemAvailabilityForStore({
      storeCode,
      push: batch,
      remember: batch.length === work.push.length ? work.remember : [],
      records,
    })
    itemsUpdated += pushed.updated
    itemsFailed += pushed.failed
    for (const error of pushed.errors) {
      if (itemErrors.length < 8) itemErrors.push(`${storeCode}: ${error}`)
    }
    if (budget <= 0) break
  }

  console.info('[grab-item-availability] cron_done', {
    stores: storeCodes.length,
    itemsUpdated,
    itemsFailed,
    itemsDeferred,
  })
  return {
    stores: storeCodes.length,
    itemsUpdated,
    itemsFailed,
    itemsDeferred,
    itemErrors,
  }
}
