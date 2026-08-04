import 'server-only'

import { getBangkokDateTimeString, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { generateMemberPortalKbankQr } from '@/lib/member-portal-kbank-qr'
import { checkKbankQrStatus } from '@/lib/payments/kbank-client'
import { normalizeKbankTxnStatusToPos } from '@/lib/payments/kbank-api-reference'
import { computePosPricing } from '@/lib/pos-pricing'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { enqueueKitchenPrintJob } from '@/lib/pos-print-job-queue'
import { filterKitchenCartLinesForDineInAdd } from '@/lib/pos-kitchen-dine-in-delta'
import { enrichPosOrderRowForSaaS } from '@/lib/pos-saas-schema-compat'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { resolvePosMenuDescriptionForChannel } from '@/lib/pos-menu-display-description'
import { normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'
import { resolveKbankRuntimeForStoreCode, resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'
import { supabaseInsertWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import {
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsert,
  supabaseDeleteByFilter,
  supabaseInsert,
} from '@/lib/supabase-server'
import {
  generateQrSessionSecret,
  generateQrTableTokenValue,
  verifyQrSessionSecret,
} from '@/lib/qr-table-session-auth'
import {
  QR_TABLE_CREATED_BY_PREFIX,
  buffetTierDisplayName,
  defaultQrOrderStoreSettings,
  type QrBuffetTier,
  type QrCartLineInput,
  type QrOrderMode,
  type QrOrderStoreSettings,
  type QrPaymentMode,
  type QrResolvedPaymentMode,
  type QrSessionStatus,
  type QrTableSession,
  type QrTableToken,
} from '@/lib/qr-table-types'

type DbSettings = {
  store_code?: string
  enabled?: boolean
  mode?: string
  entry_payment_mode?: string
  extras_payment_mode?: string
  require_staff_open?: boolean
  max_open_minutes?: number
  allow_reorder_after_paid?: boolean
  print_logo_url?: string | null
  print_brand_color?: string | null
  print_accent_color?: string | null
  print_brand_line?: string | null
}

type DbTier = {
  id?: number
  store_code?: string
  code?: string
  name_th?: string
  name_en?: string
  name_ko?: string
  price_per_person?: number | string
  sort_order?: number
  active?: boolean
  valid_from?: string | null
  valid_to?: string | null
}

type DbSession = {
  id?: number
  store_code?: string
  table_name?: string
  token_id?: number | null
  status?: string
  guest_count?: number
  tier_id?: number | null
  tier_price_snapshot?: number | string
  entry_total?: number | string
  entry_payment_mode_resolved?: string
  extras_payment_mode_resolved?: string
  entry_paid?: boolean
  entry_paid_at?: string | null
  entry_payment_channel?: string | null
  pos_order_id?: number | null
  session_secret_hash?: string
  opened_by?: string
  pending_entry_partner_txn_id?: string | null
  pending_extras_partner_txn_id?: string | null
  pending_extras_amount?: number | string | null
  staff_call_at?: string | null
  staff_call_note?: string | null
  closed_at?: string | null
  created_at?: string
  updated_at?: string
}

type DbToken = {
  id?: number
  store_code?: string
  table_name?: string
  token?: string
  active?: boolean
}

type DbMenu = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  price?: number | string
  image?: string | null
  image_url?: string | null
  is_active?: boolean
  sell_hall?: boolean
  sold_out_date?: string | null
  description_default?: string | null
  description_table?: string | null
  kitchen_printer?: number | null
  sort_order?: number | null
}

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function mapSettings(row: DbSettings | null | undefined, storeCode: string): QrOrderStoreSettings {
  if (!row) return defaultQrOrderStoreSettings(storeCode)
  const mode = String(row.mode || 'buffet') as QrOrderMode
  const entry = String(row.entry_payment_mode || 'postpay') as QrPaymentMode
  const extras = String(row.extras_payment_mode || 'postpay') as QrPaymentMode
  return {
    storeCode: String(row.store_code || storeCode).trim(),
    enabled: Boolean(row.enabled),
    mode: mode === 'a_la_carte' || mode === 'both' ? mode : 'buffet',
    entryPaymentMode: entry === 'prepay' || entry === 'guest_choice' ? entry : 'postpay',
    extrasPaymentMode: extras === 'prepay' || extras === 'guest_choice' ? extras : 'postpay',
    requireStaffOpen: row.require_staff_open !== false,
    maxOpenMinutes: Math.max(30, Math.floor(asNum(row.max_open_minutes) || 240)),
    allowReorderAfterPaid: Boolean(row.allow_reorder_after_paid),
    printLogoUrl: String(row.print_logo_url || '').trim(),
    printBrandColor: String(row.print_brand_color || '').trim() || '#b45309',
    printAccentColor: String(row.print_accent_color || '').trim() || '#faf7f2',
    printBrandLine: String(row.print_brand_line || '').trim(),
  }
}

function mapTier(row: DbTier, includedMenuIds?: number[]): QrBuffetTier {
  return {
    id: Number(row.id || 0),
    storeCode: String(row.store_code || '').trim(),
    code: String(row.code || '').trim(),
    nameTh: String(row.name_th || ''),
    nameEn: String(row.name_en || ''),
    nameKo: String(row.name_ko || ''),
    pricePerPerson: asNum(row.price_per_person),
    sortOrder: Math.floor(asNum(row.sort_order)),
    active: row.active !== false,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    includedMenuIds,
  }
}

function mapSession(row: DbSession): QrTableSession {
  return {
    id: Number(row.id || 0),
    storeCode: String(row.store_code || '').trim(),
    tableName: String(row.table_name || '').trim(),
    tokenId: row.token_id != null ? Number(row.token_id) : null,
    status: String(row.status || 'awaiting_entry') as QrSessionStatus,
    guestCount: Math.max(1, Math.floor(asNum(row.guest_count) || 1)),
    tierId: row.tier_id != null ? Number(row.tier_id) : null,
    tierPriceSnapshot: asNum(row.tier_price_snapshot),
    entryTotal: asNum(row.entry_total),
    entryPaymentModeResolved: (String(row.entry_payment_mode_resolved || 'postpay') === 'prepay'
      ? 'prepay'
      : 'postpay') as QrResolvedPaymentMode,
    extrasPaymentModeResolved: (String(row.extras_payment_mode_resolved || 'postpay') === 'prepay'
      ? 'prepay'
      : 'postpay') as QrResolvedPaymentMode,
    entryPaid: Boolean(row.entry_paid),
    entryPaidAt: row.entry_paid_at ? String(row.entry_paid_at) : null,
    entryPaymentChannel:
      row.entry_payment_channel === 'qr' || row.entry_payment_channel === 'pos'
        ? row.entry_payment_channel
        : null,
    posOrderId: row.pos_order_id != null ? Number(row.pos_order_id) : null,
    openedBy: String(row.opened_by || 'guest_qr'),
    staffCallAt: row.staff_call_at ? String(row.staff_call_at) : null,
    staffCallNote: row.staff_call_note ? String(row.staff_call_note) : null,
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  }
}

function mapToken(row: DbToken, origin?: string): QrTableToken {
  const token = String(row.token || '')
  return {
    id: Number(row.id || 0),
    storeCode: String(row.store_code || '').trim(),
    tableName: String(row.table_name || '').trim(),
    token,
    active: row.active !== false,
    publicUrl: origin && token ? `${origin.replace(/\/$/, '')}/t/${token}` : undefined,
  }
}

function resolvePaymentChoice(
  storeMode: QrPaymentMode,
  guestChoice?: string | null
): QrResolvedPaymentMode {
  if (storeMode === 'prepay') return 'prepay'
  if (storeMode === 'postpay') return 'postpay'
  const g = String(guestChoice || '').trim().toLowerCase()
  return g === 'prepay' ? 'prepay' : 'postpay'
}

function tierValidToday(tier: DbTier, today: string): boolean {
  if (tier.active === false) return false
  const from = String(tier.valid_from || '').trim()
  const to = String(tier.valid_to || '').trim()
  if (from && today < from) return false
  if (to && today > to) return false
  return true
}

function parseItemsJson(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>
    } catch {
      /* ignore */
    }
  }
  return []
}

function lineQty(it: Record<string, unknown>): number {
  return Math.max(0, asNum(it.qty ?? it.quantity ?? 0))
}

function lineUnitPrice(it: Record<string, unknown>): number {
  return asNum(it.price ?? it.unitPrice ?? 0)
}

function computeItemsSubtotal(items: Array<Record<string, unknown>>): number {
  return items.reduce((sum, it) => sum + lineQty(it) * lineUnitPrice(it), 0)
}

export async function loadQrOrderStoreSettings(storeCode: string): Promise<QrOrderStoreSettings> {
  const code = String(storeCode || '').trim()
  if (!code) return defaultQrOrderStoreSettings('')
  const rows = (await supabaseSelectFilter('pos_qr_order_store_settings', `store_code=eq.${encodeURIComponent(code)}`, {
    limit: 1,
  })) as DbSettings[]
  return mapSettings(rows?.[0], code)
}

export async function upsertQrOrderStoreSettings(
  settings: QrOrderStoreSettings
): Promise<QrOrderStoreSettings> {
  const storeCode = String(settings.storeCode || '').trim()
  if (!storeCode) throw new Error('store_required')
  const now = getBangkokDateTimeString()
  await supabaseUpsert(
    'pos_qr_order_store_settings',
    [
      {
        store_code: storeCode,
        enabled: Boolean(settings.enabled),
        mode: settings.mode,
        entry_payment_mode: settings.entryPaymentMode,
        extras_payment_mode: settings.extrasPaymentMode,
        require_staff_open: Boolean(settings.requireStaffOpen),
        max_open_minutes: Math.max(30, Math.floor(settings.maxOpenMinutes || 240)),
        allow_reorder_after_paid: Boolean(settings.allowReorderAfterPaid),
        print_logo_url: String(settings.printLogoUrl || '').trim() || null,
        print_brand_color: String(settings.printBrandColor || '').trim() || null,
        print_accent_color: String(settings.printAccentColor || '').trim() || null,
        print_brand_line: String(settings.printBrandLine || '').trim() || null,
        updated_at: now,
      },
    ],
    'store_code'
  )
  return loadQrOrderStoreSettings(storeCode)
}

export async function loadBuffetTiersForStore(
  storeCode: string,
  opts?: { includeInactive?: boolean; withMenus?: boolean }
): Promise<QrBuffetTier[]> {
  const code = String(storeCode || '').trim()
  if (!code) return []
  const today = getBangkokTodayDateString()
  const filter = opts?.includeInactive
    ? `store_code=eq.${encodeURIComponent(code)}`
    : `store_code=eq.${encodeURIComponent(code)}&active=eq.true`
  const rows = (await supabaseSelectFilter('pos_buffet_tiers', filter, {
    limit: 200,
    order: 'sort_order.asc,id.asc',
  })) as DbTier[]
  const tiers = (rows || []).filter((r) => opts?.includeInactive || tierValidToday(r, today))
  if (!opts?.withMenus || !tiers.length) return tiers.map((r) => mapTier(r))

  const ids = tiers.map((t) => Number(t.id || 0)).filter(Boolean)
  const menuRows = (await supabaseSelectFilter(
    'pos_buffet_tier_menus',
    `tier_id=in.(${ids.join(',')})`,
    { limit: 5000 }
  )) as Array<{ tier_id?: number; menu_id?: number }>
  const byTier = new Map<number, number[]>()
  for (const m of menuRows || []) {
    const tid = Number(m.tier_id || 0)
    const mid = Number(m.menu_id || 0)
    if (!tid || !mid) continue
    const arr = byTier.get(tid) || []
    arr.push(mid)
    byTier.set(tid, arr)
  }
  return tiers.map((r) => mapTier(r, byTier.get(Number(r.id || 0)) || []))
}

export async function saveBuffetTier(input: {
  id?: number
  storeCode: string
  code: string
  nameTh?: string
  nameEn?: string
  nameKo?: string
  pricePerPerson: number
  sortOrder?: number
  active?: boolean
  validFrom?: string | null
  validTo?: string | null
  includedMenuIds?: number[]
}): Promise<QrBuffetTier> {
  const storeCode = String(input.storeCode || '').trim()
  const code = String(input.code || '').trim().toUpperCase()
  if (!storeCode || !code) throw new Error('tier_required')
  const now = getBangkokDateTimeString()
  const payload = {
    store_code: storeCode,
    code,
    name_th: String(input.nameTh || ''),
    name_en: String(input.nameEn || ''),
    name_ko: String(input.nameKo || ''),
    price_per_person: Math.max(0, asNum(input.pricePerPerson)),
    sort_order: Math.floor(asNum(input.sortOrder)),
    active: input.active !== false,
    valid_from: input.validFrom || null,
    valid_to: input.validTo || null,
    updated_at: now,
  }

  let tierId = Number(input.id || 0)
  if (tierId > 0) {
    await supabaseUpdateByFilter('pos_buffet_tiers', `id=eq.${tierId}`, payload)
  } else {
    const inserted = (await supabaseInsertWithPgrst204Fallback(
      'pos_buffet_tiers',
      { ...payload, created_at: now },
      'posBuffetTierInsert'
    )) as DbTier[]
    tierId = Number(inserted?.[0]?.id || 0)
    if (!tierId) throw new Error('tier_insert_failed')
  }

  if (Array.isArray(input.includedMenuIds)) {
    await supabaseDeleteByFilter('pos_buffet_tier_menus', `tier_id=eq.${tierId}`)
    const menuIds = [...new Set(input.includedMenuIds.map((x) => Math.floor(Number(x))).filter((x) => x > 0))]
    for (const menu_id of menuIds) {
      await supabaseInsert('pos_buffet_tier_menus', { tier_id: tierId, menu_id })
    }
    // 포함으로 고른 메뉴는 buffet_includable 자동 ON (메뉴 관리 이중 설정 불필요)
    if (menuIds.length > 0) {
      try {
        await supabaseUpdateByFilter(
          'pos_menus',
          `id=in.(${menuIds.join(',')})`,
          { buffet_includable: true }
        )
      } catch {
        // 컬럼 미배포 시 무시 — 티어 메뉴 연결만으로도 손님 앱 포함 동작
      }
    }
  }

  const tiers = await loadBuffetTiersForStore(storeCode, { includeInactive: true, withMenus: true })
  const found = tiers.find((t) => t.id === tierId)
  if (!found) throw new Error('tier_not_found')
  return found
}

export async function deleteBuffetTier(tierId: number): Promise<void> {
  const id = Math.floor(Number(tierId))
  if (!id) throw new Error('tier_required')
  await supabaseDeleteByFilter('pos_buffet_tiers', `id=eq.${id}`)
}

export async function findQrTokenByValue(token: string): Promise<QrTableToken | null> {
  const t = String(token || '').trim()
  if (!t) return null
  const rows = (await supabaseSelectFilter(
    'pos_table_qr_tokens',
    `token=eq.${encodeURIComponent(t)}&active=eq.true`,
    { limit: 1 }
  )) as DbToken[]
  const row = rows?.[0]
  return row ? mapToken(row) : null
}

export async function listQrTokensForStore(storeCode: string, origin?: string): Promise<QrTableToken[]> {
  const code = String(storeCode || '').trim()
  if (!code) return []
  const rows = (await supabaseSelectFilter(
    'pos_table_qr_tokens',
    `store_code=eq.${encodeURIComponent(code)}&active=eq.true`,
    { limit: 500, order: 'table_name.asc' }
  )) as DbToken[]
  return (rows || []).map((r) => mapToken(r, origin))
}

export async function ensureQrTokensForTables(params: {
  storeCode: string
  tableNames: string[]
  origin?: string
}): Promise<QrTableToken[]> {
  const storeCode = String(params.storeCode || '').trim()
  if (!storeCode) throw new Error('store_required')
  const names = [...new Set((params.tableNames || []).map((n) => String(n || '').trim()).filter(Boolean))]
  const existing = await listQrTokensForStore(storeCode, params.origin)
  const byName = new Map(existing.map((t) => [t.tableName, t]))
  const now = getBangkokDateTimeString()
  for (const tableName of names) {
    if (byName.has(tableName)) continue
    const token = generateQrTableTokenValue()
    const inserted = (await supabaseInsertWithPgrst204Fallback(
      'pos_table_qr_tokens',
      {
        store_code: storeCode,
        table_name: tableName,
        token,
        active: true,
        created_at: now,
        updated_at: now,
      },
      'posTableQrTokenInsert'
    )) as DbToken[]
    const row = inserted?.[0]
    if (row) byName.set(tableName, mapToken(row, params.origin))
  }
  return [...byName.values()].sort((a, b) => a.tableName.localeCompare(b.tableName))
}

export async function rotateQrToken(params: {
  storeCode: string
  tableName: string
  origin?: string
}): Promise<QrTableToken> {
  const storeCode = String(params.storeCode || '').trim()
  const tableName = String(params.tableName || '').trim()
  if (!storeCode || !tableName) throw new Error('table_required')
  const now = getBangkokDateTimeString()
  await supabaseUpdateByFilter(
    'pos_table_qr_tokens',
    `store_code=eq.${encodeURIComponent(storeCode)}&table_name=eq.${encodeURIComponent(tableName)}&active=eq.true`,
    { active: false, rotated_at: now, updated_at: now }
  )
  const token = generateQrTableTokenValue()
  const inserted = (await supabaseInsertWithPgrst204Fallback(
    'pos_table_qr_tokens',
    {
      store_code: storeCode,
      table_name: tableName,
      token,
      active: true,
      created_at: now,
      updated_at: now,
    },
    'posTableQrTokenRotate'
  )) as DbToken[]
  const row = inserted?.[0]
  if (!row) throw new Error('token_rotate_failed')
  return mapToken(row, params.origin)
}

export async function loadSessionById(sessionId: number): Promise<(QrTableSession & { secretHash: string }) | null> {
  const id = Math.floor(Number(sessionId))
  if (!id) return null
  const rows = (await supabaseSelectFilter('pos_qr_table_sessions', `id=eq.${id}`, {
    limit: 1,
  })) as DbSession[]
  const row = rows?.[0]
  if (!row?.id) return null
  return { ...mapSession(row), secretHash: String(row.session_secret_hash || '') }
}

export async function loadActiveSessionForTable(
  storeCode: string,
  tableName: string
): Promise<QrTableSession | null> {
  const code = String(storeCode || '').trim()
  const table = String(tableName || '').trim()
  if (!code || !table) return null
  const rows = (await supabaseSelectFilter(
    'pos_qr_table_sessions',
    `store_code=eq.${encodeURIComponent(code)}&table_name=eq.${encodeURIComponent(table)}&status=in.(awaiting_entry,active)`,
    { limit: 1, order: 'id.desc' }
  )) as DbSession[]
  const row = rows?.[0]
  if (!row) return null
  return expireSessionIfStale(mapSession(row))
}

export async function requireQrGuestSession(
  sessionId: number,
  rawSecret: string
): Promise<QrTableSession> {
  const session = await loadSessionById(sessionId)
  if (!session) throw new Error('session_not_found')
  if (!verifyQrSessionSecret(rawSecret, session.secretHash)) throw new Error('session_forbidden')
  const live = await expireSessionIfStale(session)
  if (!live || live.status === 'closed' || live.status === 'expired') throw new Error('session_expired')
  return live
}

function sessionAgeMinutes(createdAt: string): number {
  const t = Date.parse(String(createdAt || ''))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (Date.now() - t) / 60000)
}

/** Soft-expire open sessions past max_open_minutes (lazy + cron). */
export async function expireSessionIfStale(session: QrTableSession): Promise<QrTableSession | null> {
  if (session.status === 'closed' || session.status === 'expired') return null
  try {
    const settings = await loadQrOrderStoreSettings(session.storeCode)
    const maxMin = Math.max(30, Math.floor(settings.maxOpenMinutes || 240))
    if (sessionAgeMinutes(session.createdAt) < maxMin) return session
    const now = getBangkokDateTimeString()
    await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
      status: 'expired',
      closed_at: now,
      updated_at: now,
      staff_call_at: null,
      staff_call_note: null,
    })
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/pgrst205|schema_missing|pos_qr_table_sessions|could not find/i.test(msg)) return session
    console.error('expireSessionIfStale:', e)
    return session
  }
}

export async function expireStaleQrSessionsBatch(limit = 200): Promise<number> {
  const rows = (await supabaseSelectFilter(
    'pos_qr_table_sessions',
    `status=in.(awaiting_entry,active)`,
    { limit, order: 'id.asc', select: 'id,store_code,created_at,status,guest_count,tier_id,tier_price_snapshot,entry_total,entry_payment_mode_resolved,extras_payment_mode_resolved,entry_paid,entry_paid_at,entry_payment_channel,pos_order_id,opened_by,staff_call_at,staff_call_note,token_id,table_name,updated_at' }
  )) as DbSession[]
  let n = 0
  for (const row of rows || []) {
    const mapped = mapSession(row)
    const next = await expireSessionIfStale(mapped)
    if (!next) n += 1
  }
  return n
}

export async function syncQrSessionTableNameForOrder(params: {
  orderId: number
  targetTableName: string
}): Promise<void> {
  const orderId = Math.trunc(Number(params.orderId || 0))
  const table = String(params.targetTableName || '').trim()
  if (!orderId || !table) return
  try {
    const now = getBangkokDateTimeString()
    const rows = (await supabaseSelectFilter(
      'pos_qr_table_sessions',
      `pos_order_id=eq.${orderId}&status=in.(awaiting_entry,active)`,
      { limit: 20, select: 'id' }
    )) as Array<{ id?: number }>
    for (const r of rows || []) {
      const id = Number(r.id || 0)
      if (!id) continue
      await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${id}`, {
        table_name: table,
        updated_at: now,
      })
    }
  } catch (e) {
    console.error('syncQrSessionTableNameForOrder:', e)
  }
}

/** Absorb 주문에 묶인 QR 세션은 종료. keep 주문 세션은 유지. */
export async function closeQrSessionsForAbsorbedOrder(absorbOrderId: number): Promise<void> {
  const orderId = Math.trunc(Number(absorbOrderId || 0))
  if (!orderId) return
  try {
    await closeQrTableSessionsForPosOrder({ orderId, reason: 'merged' })
  } catch (e) {
    console.error('closeQrSessionsForAbsorbedOrder:', e)
  }
}

export async function requestStaffCall(params: {
  session: QrTableSession
  note?: string
}): Promise<QrTableSession> {
  if (params.session.status !== 'active' && params.session.status !== 'awaiting_entry') {
    throw new Error('session_closed')
  }
  const now = getBangkokDateTimeString()
  const note = String(params.note || '').trim().slice(0, 120)
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${params.session.id}`, {
    staff_call_at: now,
    staff_call_note: note || null,
    updated_at: now,
  })
  const next = await loadSessionById(params.session.id)
  if (!next) throw new Error('session_not_found')
  return next
}

export async function ackStaffCall(sessionId: number): Promise<QrTableSession> {
  const id = Math.trunc(Number(sessionId || 0))
  if (!id) throw new Error('session_not_found')
  const now = getBangkokDateTimeString()
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${id}`, {
    staff_call_at: null,
    staff_call_note: null,
    updated_at: now,
  })
  const next = await loadSessionById(id)
  if (!next) throw new Error('session_not_found')
  return next
}

export type QrFloorSessionHint = {
  tableName: string
  status: QrSessionStatus
  entryPaid: boolean
  staffCallAt: string | null
  posOrderId: number | null
}

/**
 * POS 홀 배지용 활성 QR 세션 맵.
 * QR 미사용 매장은 세션 조회·만료 루프를 건너뛴다 (Vercel Fluid CPU 절감).
 */
export async function listActiveQrSessionsForStore(
  storeCode: string
): Promise<{ enabled: boolean; sessions: QrFloorSessionHint[] }> {
  const code = String(storeCode || '').trim()
  if (!code) return { enabled: false, sessions: [] }
  try {
    const settings = await loadQrOrderStoreSettings(code)
    if (!settings.enabled) return { enabled: false, sessions: [] }

    const maxMin = Math.max(30, Math.floor(settings.maxOpenMinutes || 240))
    const rows = (await supabaseSelectFilter(
      'pos_qr_table_sessions',
      `store_code=eq.${encodeURIComponent(code)}&status=in.(awaiting_entry,active)`,
      {
        limit: 500,
        order: 'id.desc',
        select:
          'id,store_code,table_name,status,entry_paid,staff_call_at,pos_order_id,created_at,guest_count,tier_id,tier_price_snapshot,entry_total,entry_payment_mode_resolved,extras_payment_mode_resolved,entry_paid_at,entry_payment_channel,opened_by,token_id,updated_at,staff_call_note',
      }
    )) as DbSession[]
    const out: QrFloorSessionHint[] = []
    const seen = new Set<string>()
    const now = getBangkokDateTimeString()
    for (const row of rows || []) {
      const mapped = mapSession(row)
      // settings는 위에서 1회만 로드 — 행마다 loadQrOrderStoreSettings 호출하지 않음
      let live: QrTableSession | null = mapped
      if (sessionAgeMinutes(mapped.createdAt) >= maxMin) {
        try {
          await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${mapped.id}`, {
            status: 'expired',
            closed_at: now,
            updated_at: now,
            staff_call_at: null,
            staff_call_note: null,
          })
          live = null
        } catch {
          // expireSessionIfStale와 동일: UPDATE 실패 시 힌트는 유지 (배지만 사라지지 않게)
        }
      }
      if (!live) continue
      const key = live.tableName.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        tableName: live.tableName,
        status: live.status,
        entryPaid: live.entryPaid,
        staffCallAt: live.staffCallAt || null,
        posOrderId: live.posOrderId,
      })
    }
    return { enabled: true, sessions: out }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/pgrst205|schema_missing|pos_qr_table_sessions|pos_qr_order_store_settings|could not find/i.test(msg)) {
      return { enabled: false, sessions: [] }
    }
    throw e
  }
}

async function loadIncludedMenuIdSet(tierId: number): Promise<Set<number>> {
  const rows = (await supabaseSelectFilter('pos_buffet_tier_menus', `tier_id=eq.${tierId}`, {
    limit: 5000,
  })) as Array<{ menu_id?: number }>
  return new Set((rows || []).map((r) => Number(r.menu_id || 0)).filter(Boolean))
}

async function loadPosMenusByIds(menuIds: number[]): Promise<DbMenu[]> {
  const ids = [...new Set(menuIds.map((n) => Math.floor(Number(n) || 0)).filter((n) => n > 0))]
  if (!ids.length) return []
  const chunkSize = 80
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize))
  }
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const rows = (await supabaseSelectFilter(
        'pos_menus',
        `id=in.(${chunk.join(',')})&is_active=eq.true`,
        { limit: chunk.length + 10 }
      )) as DbMenu[]
      return rows || []
    })
  )
  return parts.flat()
}

async function loadHallMenusForStore(storeCode: string): Promise<DbMenu[]> {
  const code = String(storeCode || '').trim()
  const scopes = (await supabaseSelectFilter(
    'pos_menu_store_scopes',
    `store_code=eq.${encodeURIComponent(code)}`,
    { limit: 20000, select: 'menu_id' }
  )) as Array<{ menu_id?: number }>
  const menuIds = [...new Set((scopes || []).map((s) => Number(s.menu_id || 0)).filter(Boolean))]
  if (!menuIds.length) {
    // fallback: all active hall menus (compat)
    return (await supabaseSelectFilter('pos_menus', `is_active=eq.true&sell_hall=eq.true`, {
      limit: 2000,
      order: 'sort_order.asc,id.asc',
    })) as DbMenu[]
  }
  const rows = await loadPosMenusByIds(menuIds)
  return rows.filter((r) => r.sell_hall !== false)
}

/**
 * 카트 제출용 — 요청 menuId만 조회 (전체 홀 메뉴 순차 로드 제거).
 * 매장 스코프가 있으면 스코프 안 메뉴만 허용.
 */
async function loadCartMenusByIdsForStore(
  storeCode: string,
  requestedMenuIds: number[]
): Promise<Map<number, DbMenu>> {
  const ids = [...new Set(requestedMenuIds.map((n) => Math.floor(Number(n) || 0)).filter((n) => n > 0))]
  const out = new Map<number, DbMenu>()
  if (!ids.length) return out

  const code = String(storeCode || '').trim()
  const [menuRows, scopedRows, anyScopeRow] = await Promise.all([
    loadPosMenusByIds(ids),
    supabaseSelectFilter(
      'pos_menu_store_scopes',
      `store_code=eq.${encodeURIComponent(code)}&menu_id=in.(${ids.join(',')})`,
      { limit: ids.length + 10, select: 'menu_id' }
    ) as Promise<Array<{ menu_id?: number }>>,
    supabaseSelectFilter('pos_menu_store_scopes', `store_code=eq.${encodeURIComponent(code)}`, {
      limit: 1,
      select: 'menu_id',
    }) as Promise<Array<{ menu_id?: number }>>,
  ])

  const storeUsesScopes = (anyScopeRow || []).length > 0
  const allowed = storeUsesScopes
    ? new Set((scopedRows || []).map((r) => Number(r.menu_id || 0)).filter(Boolean))
    : null

  for (const r of menuRows || []) {
    const id = Number(r.id || 0)
    if (!id || r.sell_hall === false) continue
    if (allowed && !allowed.has(id)) continue
    out.set(id, r)
  }
  return out
}

export type QrGuestOrderSummary = {
  orderId: number | null
  items: Array<Record<string, unknown>>
  subtotal: number
  total: number
  paymentQr: number
  balanceDue: number
  status: string
}

function buildGuestOrderSummaryFromOrderRow(params: {
  orderId: number
  items: Array<Record<string, unknown>>
  subtotal: number
  total: number
  paymentQr?: number
  paymentCash?: number
  paymentCard?: number
  paymentOther?: number
  status?: string
}): QrGuestOrderSummary {
  const paid =
    asNum(params.paymentQr) +
    asNum(params.paymentCash) +
    asNum(params.paymentCard) +
    asNum(params.paymentOther)
  const total = asNum(params.total)
  return {
    orderId: params.orderId,
    items: params.items,
    subtotal: asNum(params.subtotal),
    total,
    paymentQr: asNum(params.paymentQr),
    balanceDue: Math.max(0, Math.round((total - paid) * 100) / 100),
    status: String(params.status || ''),
  }
}

export async function getPublicSessionBootstrap(token: string, origin?: string) {
  const tok = await findQrTokenByValue(token)
  if (!tok) throw new Error('invalid_token')
  const settings = await loadQrOrderStoreSettings(tok.storeCode)
  if (!settings.enabled) throw new Error('store_disabled')
  const tiers =
    settings.mode === 'a_la_carte'
      ? []
      : await loadBuffetTiersForStore(tok.storeCode, { withMenus: true })
  const activeSession = await loadActiveSessionForTable(tok.storeCode, tok.tableName)
  return {
    token: mapToken(tok, origin),
    settings,
    tiers,
    activeSession,
    canGuestOpen: !settings.requireStaffOpen,
  }
}

export async function claimQrTableSession(params: {
  token: string
}): Promise<{ session: QrTableSession; rawSecret: string }> {
  const tok = await findQrTokenByValue(params.token)
  if (!tok) throw new Error('invalid_token')
  const settings = await loadQrOrderStoreSettings(tok.storeCode)
  if (!settings.enabled) throw new Error('store_disabled')

  const existing = await loadActiveSessionForTable(tok.storeCode, tok.tableName)
  if (!existing) throw new Error('session_not_found')
  if (existing.status === 'closed' || existing.status === 'expired') throw new Error('session_closed')

  const { raw, hash } = generateQrSessionSecret()
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${existing.id}`, {
    session_secret_hash: hash,
    updated_at: getBangkokDateTimeString(),
  })
  const session = await loadSessionById(existing.id)
  if (!session) throw new Error('session_not_found')
  return { session, rawSecret: raw }
}

export async function openQrTableSession(params: {
  storeCode: string
  tableName: string
  tokenId?: number | null
  guestCount: number
  tierId: number
  entryPaymentChoice?: string | null
  extrasPaymentChoice?: string | null
  openedBy: string
  forceStaff?: boolean
}): Promise<{ session: QrTableSession; rawSecret: string }> {
  const storeCode = String(params.storeCode || '').trim()
  const tableName = String(params.tableName || '').trim()
  const guestCount = Math.min(99, Math.max(1, Math.floor(Number(params.guestCount) || 1)))
  let tierId = Math.floor(Number(params.tierId) || 0)
  if (!storeCode || !tableName) throw new Error('open_required')

  const settings = await loadQrOrderStoreSettings(storeCode)
  if (!settings.enabled) throw new Error('store_disabled')
  if (settings.requireStaffOpen && !params.forceStaff) throw new Error('staff_open_required')

  const existing = await loadActiveSessionForTable(storeCode, tableName)
  if (existing) throw new Error('table_busy')

  const isAlaCarteOnly = settings.mode === 'a_la_carte'
  if (isAlaCarteOnly) tierId = 0
  if (!isAlaCarteOnly && !tierId) throw new Error('tier_required')

  let tier: QrBuffetTier | null = null
  let entryTotal = 0
  let tierPriceSnapshot = 0
  if (tierId > 0) {
    const tiers = await loadBuffetTiersForStore(storeCode, { withMenus: false })
    tier = tiers.find((t) => t.id === tierId) || null
    if (!tier || !tier.active) throw new Error('tier_not_found')
    tierPriceSnapshot = tier.pricePerPerson
    entryTotal = Math.round(tier.pricePerPerson * guestCount * 100) / 100
  }

  const entryMode = resolvePaymentChoice(settings.entryPaymentMode, params.entryPaymentChoice)
  const extrasMode = resolvePaymentChoice(settings.extrasPaymentMode, params.extrasPaymentChoice)
  // À la carte: no buffet entry fee — unlock immediately (postpay path) or via staff
  const effectiveEntryMode: QrResolvedPaymentMode =
    !tierId ? 'postpay' : entryMode
  const { raw, hash } = generateQrSessionSecret()
  const now = getBangkokDateTimeString()

  let resolvedStatus: QrSessionStatus = 'awaiting_entry'
  let resolvedEntryPaid = false
  if (!tierId) {
    // No entry fee: staff open unlocks; guest open also unlocks when staff-open not required
    resolvedStatus = 'active'
    resolvedEntryPaid = true
  } else if (effectiveEntryMode === 'postpay' && params.forceStaff) {
    resolvedStatus = 'active'
    resolvedEntryPaid = true
  } else if (effectiveEntryMode === 'prepay') {
    resolvedStatus = 'awaiting_entry'
    resolvedEntryPaid = false
  } else {
    resolvedStatus = 'awaiting_entry'
    resolvedEntryPaid = false
  }

  const inserted = (await supabaseInsertWithPgrst204Fallback(
    'pos_qr_table_sessions',
    {
      store_code: storeCode,
      table_name: tableName,
      token_id: params.tokenId ?? null,
      status: resolvedStatus,
      guest_count: guestCount,
      tier_id: tierId > 0 ? tierId : null,
      tier_price_snapshot: tierPriceSnapshot,
      entry_total: entryTotal,
      entry_payment_mode_resolved: effectiveEntryMode,
      extras_payment_mode_resolved: extrasMode,
      entry_paid: resolvedEntryPaid,
      entry_paid_at: resolvedEntryPaid ? now : null,
      entry_payment_channel: resolvedEntryPaid ? (params.forceStaff ? 'pos' : 'qr') : null,
      pos_order_id: null,
      session_secret_hash: hash,
      opened_by: String(params.openedBy || 'guest_qr'),
      created_at: now,
      updated_at: now,
    },
    'posQrTableSessionInsert'
  )) as DbSession[]

  const row = inserted?.[0]
  if (!row?.id) throw new Error('session_insert_failed')

  let session = mapSession(row)

  const orderId = await createOrEnsurePosOrderForSession(session, tier)
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
    pos_order_id: orderId,
    updated_at: getBangkokDateTimeString(),
  })
  session = { ...session, posOrderId: orderId }

  return { session, rawSecret: raw }
}

async function createOrEnsurePosOrderForSession(
  session: QrTableSession,
  tier: QrBuffetTier | null
): Promise<number> {
  if (session.posOrderId) return session.posOrderId

  const items: Array<Record<string, unknown>> = []
  if (tier && session.tierId) {
    items.push({
      id: `buffet-entry-${session.id}`,
      name: `[Buffet] ${buffetTierDisplayName(tier, 'en')} × ${session.guestCount}`,
      price: session.tierPriceSnapshot,
      qty: session.guestCount,
      quantity: session.guestCount,
      note: '',
      isBuffetEntry: true,
      buffetTierId: tier.id,
      source: 'qr_table',
      kitchenPrinter: 0,
    })
  }

  const subtotal = computeItemsSubtotal(items)
  const pricing = computePosPricing({
    subtotal,
    discountAmt: 0,
    deliveryFee: 0,
    packagingFee: 0,
  })
  /** Omni Realtime은 tenant_id 필터 — 비우면 메인 POS가 폴링(5~15s)까지 메뉴를 못 봄 */
  const tenantId = (await resolveTenantIdForStoreCode(session.storeCode)) || ''
  const orderNo = await allocateNextPosOrderNo(session.storeCode, { tenantId })
  const now = getBangkokDateTimeString()
  const memo = tier
    ? `[QR테이블] ${buffetTierDisplayName(tier)} / ${session.guestCount}pax`
    : `[QR테이블] à la carte / ${session.guestCount}pax`

  const row = enrichPosOrderRowForSaaS(
    {
      order_no: orderNo,
      store_code: session.storeCode,
      order_type: coercePosOrderTypeForDb('dine_in'),
      table_name: session.tableName,
      memo,
      discount_amt: 0,
      discount_reason: null,
      service_amt: 0,
      service_reason: null,
      delivery_fee: 0,
      packaging_fee: 0,
      items_json: JSON.stringify(items),
      subtotal,
      vat: pricing.vatFeeAmt,
      total: pricing.finalTotal,
      status: 'pending',
      payment_cash: 0,
      payment_card: 0,
      payment_qr: 0,
      payment_other: 0,
      payment_delivery_app: 0,
      guest_count: session.guestCount,
      created_by: `${QR_TABLE_CREATED_BY_PREFIX}${session.id}`,
      created_at: now,
      updated_at: now,
    },
    { tenantId }
  )

  const inserted = (await supabaseInsertWithPgrst204Fallback(
    'pos_orders',
    row,
    'qrTablePosOrderInsert'
  )) as { id?: number }[]
  const orderId = Number(inserted?.[0]?.id || 0)
  if (!orderId) throw new Error('order_insert_failed')
  return orderId
}

export async function confirmEntryPostpay(params: {
  sessionId: number
  staffLabel: string
}): Promise<QrTableSession> {
  const session = await loadSessionById(params.sessionId)
  if (!session) throw new Error('session_not_found')
  if (session.status === 'closed' || session.status === 'expired') throw new Error('session_closed')
  if (session.entryPaymentModeResolved === 'prepay' && !session.entryPaid) {
    throw new Error('entry_requires_prepay')
  }
  const now = getBangkokDateTimeString()
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
    status: 'active',
    entry_paid: true,
    entry_paid_at: now,
    entry_payment_channel: session.entryPaymentChannel || 'pos',
    updated_at: now,
  })
  const next = await loadSessionById(session.id)
  if (!next) throw new Error('session_not_found')
  void params.staffLabel
  return next
}

export async function markEntryPaidByQr(sessionId: number, amount: number): Promise<QrTableSession> {
  const session = await loadSessionById(sessionId)
  if (!session) throw new Error('session_not_found')
  if (session.entryPaid) return session

  const orderId = session.posOrderId
  if (!orderId) throw new Error('order_missing')

  const orderRows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,payment_qr,status,total',
  })) as Array<{ id?: number; payment_qr?: number; status?: string; total?: number }>
  const order = orderRows?.[0]
  if (!order?.id) throw new Error('order_missing')
  if (String(order.status || '').toLowerCase() === 'paid') throw new Error('order_already_paid')

  const payAmt = Math.max(0, asNum(amount) || session.entryTotal)
  const nextQr = Math.round((asNum(order.payment_qr) + payAmt) * 100) / 100
  const now = getBangkokDateTimeString()

  // Keep status pending — partial QR only
  await supabaseUpdateByFilter('pos_orders', `id=eq.${orderId}`, {
    payment_qr: nextQr,
    updated_at: now,
  })
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${sessionId}`, {
    entry_paid: true,
    entry_paid_at: now,
    entry_payment_channel: 'qr',
    status: 'active',
    pending_entry_partner_txn_id: null,
    updated_at: now,
  })

  const next = await loadSessionById(sessionId)
  if (!next) throw new Error('session_not_found')
  return next
}

export async function issueEntryPayQr(sessionId: number): Promise<{
  partnerTransactionId: string
  qrPayload: string
  qrAmount: number
}> {
  const session = await loadSessionById(sessionId)
  if (!session) throw new Error('session_not_found')
  if (session.entryPaid) throw new Error('already_paid')
  if (session.entryPaymentModeResolved !== 'prepay') throw new Error('entry_not_prepay')
  if (!session.posOrderId) throw new Error('order_missing')

  const amount = Math.max(0, session.entryTotal)
  if (amount < 1) throw new Error('amount_below_minimum')

  const tenantId = await resolveTenantIdForStoreCode(session.storeCode)
  const gen = await generateMemberPortalKbankQr({
    amount,
    orderId: session.posOrderId,
    storeCode: session.storeCode,
    tenantId: tenantId || undefined,
    partnerTransactionId: `QTE${session.id}${Date.now()}`.slice(0, 32),
  })
  if (!gen.ok || !gen.qrPayload) throw new Error(gen.statusMessage || 'qr_failed')

  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${sessionId}`, {
    pending_entry_partner_txn_id: gen.partnerTransactionId,
    updated_at: getBangkokDateTimeString(),
  })

  return {
    partnerTransactionId: gen.partnerTransactionId,
    qrPayload: gen.qrPayload,
    qrAmount: amount,
  }
}

export async function pollEntryPayStatus(sessionId: number): Promise<{
  entryPaid: boolean
  status: QrSessionStatus
}> {
  const session = await loadSessionById(sessionId)
  if (!session) throw new Error('session_not_found')
  if (session.entryPaid) return { entryPaid: true, status: session.status }

  const rows = (await supabaseSelectFilter('pos_qr_table_sessions', `id=eq.${sessionId}`, {
    limit: 1,
    select: 'pending_entry_partner_txn_id,store_code,entry_total',
  })) as Array<{ pending_entry_partner_txn_id?: string | null; store_code?: string; entry_total?: number }>
  const partnerTxn = String(rows?.[0]?.pending_entry_partner_txn_id || '').trim()
  if (!partnerTxn) return { entryPaid: false, status: session.status }

  const runtime = await resolveKbankRuntimeForStoreCode(session.storeCode)
  try {
    const result = await checkKbankQrStatus(
      {
        orderId: session.posOrderId || undefined,
        partnerTransactionId: partnerTxn,
        originalTransactionId: partnerTxn,
        payload: { origPartnerTxnUid: partnerTxn },
      },
      { runtime }
    )
    const response =
      result.response && typeof result.response === 'object'
        ? (result.response as Record<string, unknown>)
        : {}
    const normalized = normalizeKbankTxnStatusToPos(response.txnStatus ?? response.status, response.statusCode)
    if (normalized === 'approved') {
      await markEntryPaidByQr(sessionId, asNum(rows?.[0]?.entry_total) || session.entryTotal)
      const next = await loadSessionById(sessionId)
      return { entryPaid: true, status: next?.status || 'active' }
    }
  } catch {
    /* keep pending */
  }
  return { entryPaid: false, status: session.status }
}

function menuImageUrl(m: DbMenu): string {
  return String(m.image || m.image_url || '').trim()
}

function isMenuSoldOutToday(soldOutDate: string | null | undefined): boolean {
  const d = String(soldOutDate || '').trim().slice(0, 10)
  if (!d) return false
  return d === getBangkokTodayDateString()
}

export async function loadQrMenusForSession(session: QrTableSession) {
  if (!session.entryPaid && session.status !== 'active') {
    throw new Error('entry_not_ready')
  }
  const tierId = Number(session.tierId || 0)
  const included = tierId > 0 ? await loadIncludedMenuIdSet(tierId) : new Set<number>()
  const menus = await loadHallMenusForStore(session.storeCode)
  menus.sort((a, b) => {
    const mainA = normalizePromotionCategoryMain(a.category_main)
    const mainB = normalizePromotionCategoryMain(b.category_main)
    if (mainA !== mainB) return mainA.localeCompare(mainB)
    const catA = String(a.category || '').trim()
    const catB = String(b.category || '').trim()
    if (catA !== catB) return catA.localeCompare(catB)
    const so = asNum(a.sort_order) - asNum(b.sort_order)
    if (so !== 0) return so
    return asNum(a.id) - asNum(b.id)
  })

  const includedMenus = []
  const extraMenus = []
  for (const m of menus) {
    const id = Number(m.id || 0)
    if (!id) continue
    const soldOut = isMenuSoldOutToday(m.sold_out_date)
    const isIncluded = included.has(id)
    const categoryMain = normalizePromotionCategoryMain(m.category_main)
    const category = String(m.category || '').trim()
    const item = {
      id: String(id),
      menuId: id,
      code: String(m.code || ''),
      name: String(m.name || ''),
      category,
      categoryMain,
      price: isIncluded ? 0 : asNum(m.price),
      listPrice: asNum(m.price),
      imageUrl: menuImageUrl(m),
      soldOut,
      buffetIncluded: isIncluded,
      sortOrder: asNum(m.sort_order),
      description: resolvePosMenuDescriptionForChannel(
        {
          descriptionDefault: String(m.description_default || ''),
          descriptionTable: m.description_table,
        },
        'dine_in'
      ),
      kitchenPrinter: m.kitchen_printer ?? null,
    }
    if (tierId > 0 && isIncluded) includedMenus.push(item)
    else extraMenus.push(item)
  }
  return { includedMenus, extraMenus, mode: tierId > 0 ? 'buffet' : 'a_la_carte' }
}

/** POS 결제·취소·환불 시 연결된 QR 세션을 closed 로 전환 (Realtime 영수증과 무관). */
export async function closeQrTableSessionsForPosOrder(params: {
  orderId: number
  reason?: string
}): Promise<number> {
  const orderId = Math.trunc(Number(params.orderId || 0))
  if (!orderId) return 0
  try {
    const rows = (await supabaseSelectFilter(
      'pos_qr_table_sessions',
      `pos_order_id=eq.${orderId}&status=in.(awaiting_entry,active)`,
      { limit: 50, select: 'id' }
    )) as Array<{ id?: number }>
    const ids = (rows || []).map((r) => Number(r.id || 0)).filter(Boolean)
    if (!ids.length) return 0
    const now = getBangkokDateTimeString()
    for (const id of ids) {
      await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${id}`, {
        status: 'closed',
        closed_at: now,
        updated_at: now,
      })
    }
    void params.reason
    return ids.length
  } catch (e) {
    // Schema not deployed yet — ignore
    const msg = e instanceof Error ? e.message : String(e)
    if (/pgrst205|schema_missing|pos_qr_table_sessions|could not find the table/i.test(msg)) return 0
    console.error('closeQrTableSessionsForPosOrder:', e)
    return 0
  }
}

export async function submitQrCart(params: {
  session: QrTableSession
  lines: QrCartLineInput[]
}): Promise<{ orderId: number; addedCount: number; order: QrGuestOrderSummary }> {
  const session = params.session
  if (session.status !== 'active' || !session.entryPaid) throw new Error('entry_not_ready')
  if (!session.posOrderId) throw new Error('order_missing')
  if (session.extrasPaymentModeResolved === 'prepay') {
    // Phase 3: allow submit but lines stay unpaid until extras QR — still add to order for kitchen after pay
    // For prepay extras we still add items then require pay before kitchen — simplify: reject until we issue batch
  }

  const tierId = Number(session.tierId || 0)
  const requestedIds = (params.lines || [])
    .map((line) => Math.floor(Number(line.menuId) || 0))
    .filter((id) => id > 0)

  const [included, byId, orderRows] = await Promise.all([
    tierId > 0 ? loadIncludedMenuIdSet(tierId) : Promise.resolve(new Set<number>()),
    loadCartMenusByIdsForStore(session.storeCode, requestedIds),
    supabaseSelectFilter('pos_orders', `id=eq.${session.posOrderId}`, {
      limit: 1,
      select: 'id,items_json,status,payment_qr,payment_cash,payment_card,payment_other,subtotal,total,store_code',
    }) as Promise<
      Array<{
        id?: number
        items_json?: unknown
        status?: string
        payment_qr?: number
        payment_cash?: number
        payment_card?: number
        payment_other?: number
        subtotal?: number
        total?: number
        store_code?: string
      }>
    >,
  ])

  const order = orderRows?.[0]
  if (!order?.id) throw new Error('order_missing')
  const status = String(order.status || '').toLowerCase()
  if (status === 'paid' || status === 'cancelled' || status === 'completed') {
    throw new Error('order_closed')
  }

  const prevItems = parseItemsJson(order.items_json)
  const newLines: Array<Record<string, unknown>> = []
  let extrasSubtotal = 0

  for (const line of params.lines || []) {
    const menuId = Math.floor(Number(line.menuId) || 0)
    const qty = Math.min(99, Math.max(1, Math.floor(Number(line.qty) || 0)))
    if (!menuId || !qty) continue
    const menu = byId.get(menuId)
    if (!menu) throw new Error(`menu_not_found:${menuId}`)
    if (isMenuSoldOutToday(menu.sold_out_date)) throw new Error(`menu_sold_out:${menuId}`)
    const isIncluded = included.has(menuId)
    const unitPrice = isIncluded ? 0 : asNum(menu.price)
    if (!isIncluded) extrasSubtotal += unitPrice * qty
    const kitchenTag = isIncluded ? 'Buffet' : 'Extra'
    newLines.push({
      id: `qr-${session.id}-${menuId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      menuId: String(menuId),
      name: String(menu.name || ''),
      price: unitPrice,
      qty,
      quantity: qty,
      note: [String(line.note || '').slice(0, 200), kitchenTag].filter(Boolean).join(' · '),
      buffetIncluded: isIncluded,
      buffetTierId: tierId || null,
      source: 'qr_table',
      kitchenPrinter: menu.kitchen_printer ?? null,
      qrPrepaid: false,
    })
  }
  if (!newLines.length) throw new Error('empty_cart')

  // Extras prepay: stash pending amount and do not kitchen-print until paid
  const extrasPrepay = session.extrasPaymentModeResolved === 'prepay' && extrasSubtotal > 0.005
  if (extrasPrepay) {
    await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
      pending_extras_amount: Math.round(extrasSubtotal * 100) / 100,
      updated_at: getBangkokDateTimeString(),
    })
  }

  const nextItems = [...prevItems, ...newLines]
  const subtotal = computeItemsSubtotal(nextItems)
  const pricing = computePosPricing({
    subtotal,
    discountAmt: 0,
    deliveryFee: 0,
    packagingFee: 0,
  })
  const now = getBangkokDateTimeString()

  await supabaseUpdateByFilter('pos_orders', `id=eq.${session.posOrderId}`, {
    items_json: JSON.stringify(nextItems),
    subtotal,
    vat: pricing.vatFeeAmt,
    total: pricing.finalTotal,
    updated_at: now,
  })

  if (!extrasPrepay) {
    const kitchenDelta = filterKitchenCartLinesForDineInAdd(
      newLines as Parameters<typeof filterKitchenCartLinesForDineInAdd>[0],
      [] as Parameters<typeof filterKitchenCartLinesForDineInAdd>[1]
    ).map((line) => {
      const row = line as Record<string, unknown>
      const includedLine = row.buffetIncluded === true
      const baseName = String(row.name || '')
      return {
        ...row,
        name: includedLine ? `[Buffet] ${baseName}` : `[Extra] ${baseName}`,
      }
    })
    if (kitchenDelta.length) {
      // 게스트 RTT에서 인쇄 큐 대기 제거 — 실패해도 주문 저장은 이미 완료
      void enqueueKitchenPrintJob({
        storeCode: session.storeCode,
        orderId: session.posOrderId,
        source: 'qr_table_submit',
        dedupeKey: `order:${session.posOrderId}:kitchen:qr:${Date.now()}`,
        payload: {
          action: 'update_order',
          kitchenLines: kitchenDelta,
        },
      }).catch((e) => console.error('qr_table_submit kitchen enqueue:', e))
    }
  }

  const orderSummary = buildGuestOrderSummaryFromOrderRow({
    orderId: session.posOrderId,
    items: nextItems,
    subtotal,
    total: pricing.finalTotal,
    paymentQr: order.payment_qr,
    paymentCash: order.payment_cash,
    paymentCard: order.payment_card,
    paymentOther: order.payment_other,
    status: order.status,
  })

  return { orderId: session.posOrderId, addedCount: newLines.length, order: orderSummary }
}

/** Staff: change guest count. Increase adds buffet entry qty; decrease staff-only (never below 1). */
export async function adjustQrSessionGuestCount(params: {
  sessionId: number
  newGuestCount: number
  staffLabel?: string
}): Promise<QrTableSession> {
  const session = await loadSessionById(params.sessionId)
  if (!session) throw new Error('session_not_found')
  if (session.status === 'closed' || session.status === 'expired') throw new Error('session_closed')
  if (!session.tierId || session.tierPriceSnapshot <= 0) {
    // à la carte: only update guest_count on session/order
    const nextCount = Math.min(99, Math.max(1, Math.floor(Number(params.newGuestCount) || 1)))
    const now = getBangkokDateTimeString()
    await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
      guest_count: nextCount,
      updated_at: now,
    })
    if (session.posOrderId) {
      await supabaseUpdateByFilter('pos_orders', `id=eq.${session.posOrderId}`, {
        guest_count: nextCount,
        updated_at: now,
      })
    }
    void params.staffLabel
    const next = await loadSessionById(session.id)
    if (!next) throw new Error('session_not_found')
    return next
  }

  const nextCount = Math.min(99, Math.max(1, Math.floor(Number(params.newGuestCount) || 1)))
  const prevCount = session.guestCount
  if (nextCount === prevCount) return session

  if (!session.posOrderId) throw new Error('order_missing')
  const orderRows = (await supabaseSelectFilter('pos_orders', `id=eq.${session.posOrderId}`, {
    limit: 1,
    select: 'id,items_json,status',
  })) as Array<{ id?: number; items_json?: unknown; status?: string }>
  const order = orderRows?.[0]
  if (!order?.id) throw new Error('order_missing')
  if (['paid', 'cancelled', 'completed'].includes(String(order.status || '').toLowerCase())) {
    throw new Error('order_closed')
  }

  const items = parseItemsJson(order.items_json)
  const entryIdx = items.findIndex((it) => it.isBuffetEntry === true)
  const entryTotal = Math.round(session.tierPriceSnapshot * nextCount * 100) / 100
  if (entryIdx >= 0) {
    items[entryIdx] = {
      ...items[entryIdx],
      qty: nextCount,
      quantity: nextCount,
      price: session.tierPriceSnapshot,
      name: String(items[entryIdx].name || '').replace(/×\s*\d+/, `× ${nextCount}`),
    }
  } else if (nextCount > 0) {
    items.unshift({
      id: `buffet-entry-${session.id}`,
      name: `[Buffet] entry × ${nextCount}`,
      price: session.tierPriceSnapshot,
      qty: nextCount,
      quantity: nextCount,
      note: '',
      isBuffetEntry: true,
      buffetTierId: session.tierId,
      source: 'qr_table',
      kitchenPrinter: 0,
    })
  }

  const subtotal = computeItemsSubtotal(items)
  const pricing = computePosPricing({
    subtotal,
    discountAmt: 0,
    deliveryFee: 0,
    packagingFee: 0,
  })
  const now = getBangkokDateTimeString()
  await supabaseUpdateByFilter('pos_orders', `id=eq.${session.posOrderId}`, {
    items_json: JSON.stringify(items),
    subtotal,
    vat: pricing.vatFeeAmt,
    total: pricing.finalTotal,
    guest_count: nextCount,
    updated_at: now,
  })
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
    guest_count: nextCount,
    entry_total: entryTotal,
    updated_at: now,
  })
  void params.staffLabel
  const next = await loadSessionById(session.id)
  if (!next) throw new Error('session_not_found')
  return next
}

export async function issueExtrasPayQr(sessionId: number): Promise<{
  partnerTransactionId: string
  qrPayload: string
  qrAmount: number
}> {
  const session = await loadSessionById(sessionId)
  if (!session) throw new Error('session_not_found')
  if (session.extrasPaymentModeResolved !== 'prepay') throw new Error('extras_not_prepay')
  if (!session.posOrderId) throw new Error('order_missing')

  const rows = (await supabaseSelectFilter('pos_qr_table_sessions', `id=eq.${sessionId}`, {
    limit: 1,
    select: 'pending_extras_amount',
  })) as Array<{ pending_extras_amount?: number | string | null }>
  const amount = Math.max(0, asNum(rows?.[0]?.pending_extras_amount))
  if (amount < 1) throw new Error('amount_below_minimum')

  const tenantId = await resolveTenantIdForStoreCode(session.storeCode)
  const gen = await generateMemberPortalKbankQr({
    amount,
    orderId: session.posOrderId,
    storeCode: session.storeCode,
    tenantId: tenantId || undefined,
    partnerTransactionId: `QTX${session.id}${Date.now()}`.slice(0, 32),
  })
  if (!gen.ok || !gen.qrPayload) throw new Error(gen.statusMessage || 'qr_failed')

  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${sessionId}`, {
    pending_extras_partner_txn_id: gen.partnerTransactionId,
    updated_at: getBangkokDateTimeString(),
  })

  return {
    partnerTransactionId: gen.partnerTransactionId,
    qrPayload: gen.qrPayload,
    qrAmount: amount,
  }
}

export async function pollExtrasPayStatus(sessionId: number): Promise<{ paid: boolean }> {
  const session = await loadSessionById(sessionId)
  if (!session) throw new Error('session_not_found')
  if (!session.posOrderId) throw new Error('order_missing')

  const sessRows = (await supabaseSelectFilter('pos_qr_table_sessions', `id=eq.${sessionId}`, {
    limit: 1,
    select: 'pending_extras_partner_txn_id,pending_extras_amount',
  })) as Array<{
    pending_extras_partner_txn_id?: string | null
    pending_extras_amount?: number | string | null
  }>
  const partnerTxn = String(sessRows?.[0]?.pending_extras_partner_txn_id || '').trim()
  const amount = asNum(sessRows?.[0]?.pending_extras_amount)
  if (!partnerTxn || amount < 0.005) return { paid: false }

  const runtime = await resolveKbankRuntimeForStoreCode(session.storeCode)
  try {
    const result = await checkKbankQrStatus(
      {
        orderId: session.posOrderId || undefined,
        partnerTransactionId: partnerTxn,
        originalTransactionId: partnerTxn,
        payload: { origPartnerTxnUid: partnerTxn },
      },
      { runtime }
    )
    const response =
      result.response && typeof result.response === 'object'
        ? (result.response as Record<string, unknown>)
        : {}
    const normalized = normalizeKbankTxnStatusToPos(response.txnStatus ?? response.status, response.statusCode)
    if (normalized === 'approved') {
      await finalizeExtrasPrepay(session, amount)
      return { paid: true }
    }
  } catch {
    /* pending */
  }
  return { paid: false }
}

async function finalizeExtrasPrepay(session: QrTableSession & { secretHash?: string }, amount: number) {
  if (!session.posOrderId) return
  const orderRows = (await supabaseSelectFilter('pos_orders', `id=eq.${session.posOrderId}`, {
    limit: 1,
    select: 'id,items_json,payment_qr,status',
  })) as Array<{ id?: number; items_json?: unknown; payment_qr?: number; status?: string }>
  const order = orderRows?.[0]
  if (!order?.id) return
  if (String(order.status || '').toLowerCase() === 'paid') return

  const items = parseItemsJson(order.items_json)
  // Mark recently unpaid qr extras as prepaid
  for (const it of items) {
    if (it.source === 'qr_table' && it.buffetIncluded !== true && it.qrPrepaid !== true && !it.isBuffetEntry) {
      it.qrPrepaid = true
    }
  }
  const nextQr = Math.round((asNum(order.payment_qr) + amount) * 100) / 100
  const now = getBangkokDateTimeString()
  await supabaseUpdateByFilter('pos_orders', `id=eq.${session.posOrderId}`, {
    items_json: JSON.stringify(items),
    payment_qr: nextQr,
    updated_at: now,
  })
  await supabaseUpdateByFilter('pos_qr_table_sessions', `id=eq.${session.id}`, {
    pending_extras_partner_txn_id: null,
    pending_extras_amount: 0,
    updated_at: now,
  })

  // Kitchen print unpaid extras that were waiting
  const kitchenLines = items.filter(
    (it) => it.source === 'qr_table' && it.qrPrepaid === true && it.buffetIncluded !== true && !it.isBuffetEntry
  )
  // Only print delta once — use amount-based dedupe
  const toPrint = kitchenLines.slice(-20).map((it) => ({
    ...it,
    name: `[Extra] ${String(it.name || '')}`,
  }))
  if (toPrint.length) {
    await enqueueKitchenPrintJob({
      storeCode: session.storeCode,
      orderId: session.posOrderId,
      source: 'qr_table_extras_paid',
      dedupeKey: `order:${session.posOrderId}:kitchen:extras:${partnerDedupe(amount)}`,
      payload: {
        action: 'update_order',
        kitchenLines: toPrint,
      },
    })
  }
}

function partnerDedupe(amount: number): string {
  return `${Math.round(amount * 100)}`
}

export async function getGuestOrderSummary(session: QrTableSession): Promise<QrGuestOrderSummary> {
  if (!session.posOrderId) {
    return {
      orderId: null,
      items: [],
      subtotal: 0,
      total: 0,
      paymentQr: 0,
      balanceDue: 0,
      status: 'none',
    }
  }
  const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${session.posOrderId}`, {
    limit: 1,
    select: 'id,items_json,subtotal,total,payment_qr,payment_cash,payment_card,payment_other,status',
  })) as Array<{
    id?: number
    items_json?: unknown
    subtotal?: number
    total?: number
    payment_qr?: number
    payment_cash?: number
    payment_card?: number
    payment_other?: number
    status?: string
  }>
  const order = rows?.[0]
  if (!order?.id) {
    return {
      orderId: null,
      items: [],
      subtotal: 0,
      total: 0,
      paymentQr: 0,
      balanceDue: 0,
      status: 'none',
    }
  }
  return buildGuestOrderSummaryFromOrderRow({
    orderId: order.id,
    items: parseItemsJson(order.items_json),
    subtotal: asNum(order.subtotal),
    total: asNum(order.total),
    paymentQr: order.payment_qr,
    paymentCash: order.payment_cash,
    paymentCard: order.payment_card,
    paymentOther: order.payment_other,
    status: order.status,
  })
}
