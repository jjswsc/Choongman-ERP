import { bangkokDateStrISO, bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { getBangkokRequestDtIso } from '@/lib/bangkok-time'
import { GRAB_DELIVERY_ON_APP_PRICING_KEYS } from '@/lib/grab-menu-advanced-pricing'
import { buildGrabMenuItemId } from '@/lib/grab-menu-item-id'
import { grabJsonRequest } from '@/lib/grab-openapi'
import { grabUpdateMenuRecord } from '@/lib/grab-partner-api'
import {
  calcPromoRegularPriceForGrabCut,
  isPromoEligibleForGrabDeliveryApp,
  promoItemsToPricingLines,
  resolvePromoCutPrice,
} from '@/lib/pos-promo-cut-price'
import { isPromoVisibleInContext } from '@/lib/pos-promo-visibility'
import type { PromoOptionLike } from '@/lib/promo-economics'
import { supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

const CAMPAIGN_NAME_PREFIX = 'CM-POS-PROMO-'
/** Grab 샘플 수준 quotas (999999 등은 INVALID_QUOTAS → 5xx로 보고되는 사례 있음) */
const GRAB_CAMPAIGN_QUOTAS = { totalCount: 9999, totalCountPerUser: 99 } as const
/** Grab Create Campaign: 최소 지속 2시간 */
const GRAB_CAMPAIGN_MIN_DURATION_MS = 2 * 60 * 60_000
/** Grab Create Campaign: 운영 안전 상한(보수적 59일; "too long" 회피) */
const GRAB_CAMPAIGN_SAFE_MAX_DURATION_MS = 59 * 24 * 60 * 60_000
/** Grab Create Campaign: startTime은 “지금+리드타임” 이후. immediate도 최소 65분(Grab 거절 방지) */
const GRAB_CAMPAIGN_DEFAULT_START_LEAD_MS = 65 * 60_000
const GRAB_CAMPAIGN_IMMEDIATE_START_LEAD_MS = 65 * 60_000
const GRAB_CAMPAIGN_MIN_ALLOWED_START_LEAD_MS = 5 * 60_000
const GRAB_CAMPAIGN_MAX_ALLOWED_START_LEAD_MS = 120 * 60_000

/** Vercel `GRAB_CAMPAIGN_START_LEAD_MINUTES`. 기본 65분(Grab 최소). */
export function getGrabCampaignStartLeadMs(
  overrideMinutes?: number,
  options?: { immediatePromoDisplay?: boolean }
): number {
  const envRaw = Number(process.env.GRAB_CAMPAIGN_START_LEAD_MINUTES ?? '')
  const defaultMinutes =
    options?.immediatePromoDisplay !== false
      ? GRAB_CAMPAIGN_IMMEDIATE_START_LEAD_MS / 60_000
      : GRAB_CAMPAIGN_DEFAULT_START_LEAD_MS / 60_000
  const raw =
    overrideMinutes != null && Number.isFinite(overrideMinutes)
      ? overrideMinutes
      : Number.isFinite(envRaw) && envRaw > 0
        ? envRaw
        : defaultMinutes
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : defaultMinutes
  const clamped = Math.min(
    GRAB_CAMPAIGN_MAX_ALLOWED_START_LEAD_MS / 60_000,
    Math.max(GRAB_CAMPAIGN_MIN_ALLOWED_START_LEAD_MS / 60_000, minutes)
  )
  return Math.round(clamped * 60_000)
}

/** 캠페인 conditions.startTime / endTime (방콕 valid_from·valid_to 반영) */
/** Grab 즉시 표시: ERP 시작일이 내일이어도 캠페인·미리보기는 오늘부터 */
export function clampPromoValidFromYmdToToday(ymd: string | null | undefined): string {
  const today = bangkokDateStrISO()
  const from = String(ymd ?? '').trim() || today
  return from > today ? today : from
}

export function resolveGrabCampaignScheduleMs(params: {
  validFrom?: string | null
  validTo?: string | null
  /** 분 단위 리드타임(미지정 시 env·기본 65) */
  startLeadMinutes?: number
  nowMs?: number
  /** true면 valid_from을 오늘(방콕) 이후로 당김 */
  clampValidFromToToday?: boolean
}): { startMs: number; endMs: number; fromYmd: string; toYmd: string } {
  const today = bangkokDateStrISO()
  const rawFrom = String(params.validFrom ?? '').trim() || today
  const fromYmd = params.clampValidFromToToday ? clampPromoValidFromYmdToToday(rawFrom) : rawFrom
  const toYmd = String(params.validTo ?? '').trim() || '2099-12-31'
  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(fromYmd, toYmd)
  const nowMs = params.nowMs ?? Date.now()
  const minStartMs = nowMs + getGrabCampaignStartLeadMs(params.startLeadMinutes, {
    immediatePromoDisplay: params.clampValidFromToToday,
  })
  const startMs = Math.max(new Date(gteIso).getTime(), minStartMs)
  const promoEndMs = new Date(lteIso).getTime()

  const addUtcCalendarMonths = (baseMs: number, months: number): number => {
    const d = new Date(baseMs)
    const day = d.getUTCDate()
    const hh = d.getUTCHours()
    const mm = d.getUTCMinutes()
    const ss = d.getUTCSeconds()
    const ms = d.getUTCMilliseconds()
    const shifted = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, hh, mm, ss, ms))
    const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
    shifted.setUTCDate(Math.min(day, lastDay))
    return shifted.getTime()
  }

  const grabMaxEndMs = Math.min(
    addUtcCalendarMonths(startMs, 2),
    startMs + GRAB_CAMPAIGN_SAFE_MAX_DURATION_MS
  )
  const endMs = Math.max(
    Math.min(promoEndMs, grabMaxEndMs),
    startMs + GRAB_CAMPAIGN_MIN_DURATION_MS
  )
  return { startMs, endMs, fromYmd, toYmd }
}
const ALL_DAY_WORKING_HOUR = {
  sun: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  mon: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  tue: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  wed: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  thu: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  fri: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
  sat: { periods: [{ startTime: '00:00', endTime: '23:59' }] },
}

type PromoRow = {
  id?: number
  code?: string
  name?: string
  price?: number
  price_delivery?: number | null
  is_active?: boolean
  channel_delivery?: boolean
  delivery_app_codes?: string[] | null
  valid_from?: string | null
  valid_to?: string | null
}

type PromoItemRow = {
  promo_id?: number
  menu_id?: number | string
  option_id?: number | string | null
  quantity?: number | null
}

type MirrorMenuRow = {
  id?: number
  code?: string
  promo_id?: number | null
  sell_delivery?: boolean
  is_active?: boolean
}

type MenuPriceRow = {
  id?: number
  price?: number
  price_delivery?: number | null
}

type OptionRow = {
  menu_id?: number
  id?: number
  price_modifier?: number
  price_modifier_delivery?: number | null
}

type GrabCampaignListRow = {
  id?: string
  name?: string
  discount?: { type?: string; value?: number; scope?: { objectIDs?: string[] } }
  conditions?: { startTime?: string; endTime?: string }
}

type IndexedGrabCampaign = {
  row: GrabCampaignListRow
  section: 'ongoing' | 'upcoming'
}

export type GrabPromoCampaignDiscountType = 'percentage' | 'fixPrice'

/** 손님 앱 취소선: 기본 percentage(정가+할인율). fixPrice는 할인가만 보일 수 있음 → env `GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE=fixPrice` 로 되돌림 */
export function resolveGrabPromoCampaignDiscountType(): GrabPromoCampaignDiscountType {
  const raw = String(process.env.GRAB_PROMO_CAMPAIGN_DISCOUNT_TYPE ?? 'percentage')
    .trim()
    .toLowerCase()
  return raw === 'fixprice' ? 'fixPrice' : 'percentage'
}

/** 정가→할인가 할인율(1~99). Grab `discount.type=percentage` 용 */
export function calcGrabPercentageOffMajor(regularMajor: number, saleMajor: number): number {
  if (!Number.isFinite(regularMajor) || !Number.isFinite(saleMajor)) return 0
  if (regularMajor <= 0 || saleMajor >= regularMajor) return 0
  return Math.min(99, Math.max(1, Math.round((1 - saleMajor / regularMajor) * 100)))
}

export function buildGrabCampaignDiscountForTarget(params: {
  grabItemId: string
  salePriceMajor: number
  regularPriceMajor: number
  discountType?: GrabPromoCampaignDiscountType
}): { type: string; value: number; cap?: number; scope: { type: 'items'; objectIDs: string[] } } {
  const discountType = params.discountType ?? resolveGrabPromoCampaignDiscountType()
  const pct = calcGrabPercentageOffMajor(params.regularPriceMajor, params.salePriceMajor)
  if (discountType === 'percentage' && pct > 0) {
    return {
      type: 'percentage',
      value: pct,
      cap: 0,
      scope: { type: 'items', objectIDs: [params.grabItemId] },
    }
  }
  return {
    type: 'fixPrice',
    value: Math.round(params.salePriceMajor),
    scope: { type: 'items', objectIDs: [params.grabItemId] },
  }
}

export function grabCampaignNeedsDiscountTypeMigration(
  row: GrabCampaignListRow,
  expectedType?: GrabPromoCampaignDiscountType
): boolean {
  const existingType = String(row.discount?.type ?? '')
    .trim()
    .toLowerCase()
  const expected = expectedType ?? resolveGrabPromoCampaignDiscountType()
  if (!existingType) return false
  return existingType !== expected
}

export function grabCampaignDiscountMatchesTarget(
  row: GrabCampaignListRow,
  target: {
    grabItemId: string
    salePriceMajor: number
    regularPriceMajor: number
    discountType?: GrabPromoCampaignDiscountType
  }
): boolean {
  const discount = row.discount
  if (!discount) return false
  const expected = buildGrabCampaignDiscountForTarget({
    grabItemId: target.grabItemId,
    salePriceMajor: target.salePriceMajor,
    regularPriceMajor: target.regularPriceMajor,
    discountType: target.discountType,
  })
  const type = String(discount.type ?? '').trim()
  if (type !== expected.type) return false
  if (Math.round(Number(discount.value ?? 0)) !== Math.round(expected.value)) return false
  const objectIDs = discount.scope?.objectIDs || []
  return objectIDs.length === 1 && objectIDs[0] === target.grabItemId
}

function indexManagedCampaigns(payload: unknown): Map<string, IndexedGrabCampaign> {
  const out = new Map<string, IndexedGrabCampaign>()
  if (!payload || typeof payload !== 'object') return out
  const o = payload as Record<string, unknown>
  for (const section of ['ongoing', 'upcoming'] as const) {
    const rows = Array.isArray(o[section]) ? o[section] : []
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as GrabCampaignListRow
      const name = String(row.name ?? '').trim()
      if (!name.startsWith(CAMPAIGN_NAME_PREFIX)) continue
      const prefix = name.split(' ')[0]
      if (!prefix || out.has(prefix)) continue
      out.set(prefix, { row, section })
    }
  }
  return out
}

export function buildGrabPromoCampaignName(promoId: string | number): string {
  return `${CAMPAIGN_NAME_PREFIX}${String(promoId).trim()}`
}

export function buildGrabTargetPriceCampaignBody(params: {
  merchantID: string
  promoId: string | number
  promoName: string
  grabItemId: string
  salePriceMajor: number
  regularPriceMajor: number
  validFrom?: string | null
  validTo?: string | null
  /** 분 단위 start 리드타임(Grab 즉시 반영 시도용, 기본 env·65분) */
  campaignStartLeadMinutes?: number
  /** true면 ERP valid_from·valid_to 그대로(Grab 테스트 화면 ‘내일’ 미리보기 유지). false일 때만 오늘로 당김 */
  clampCampaignValidFromToToday?: boolean
  discountType?: GrabPromoCampaignDiscountType
}): Record<string, unknown> {
  const { startMs, endMs } = resolveGrabCampaignScheduleMs({
    validFrom: params.validFrom,
    validTo: params.validTo,
    startLeadMinutes: params.campaignStartLeadMinutes,
    clampValidFromToToday: params.clampCampaignValidFromToToday === true,
  })

  const body: Record<string, unknown> = {
    merchantID: params.merchantID,
    name: `${buildGrabPromoCampaignName(params.promoId)} ${String(params.promoName || '').trim()}`.slice(0, 256),
    quotas: { ...GRAB_CAMPAIGN_QUOTAS },
    conditions: {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      eaterType: 'all',
      minBasketAmount: 0,
      bundleQuantity: 0,
      workingHour: ALL_DAY_WORKING_HOUR,
    },
    discount: buildGrabCampaignDiscountForTarget({
      grabItemId: params.grabItemId,
      salePriceMajor: params.salePriceMajor,
      regularPriceMajor: params.regularPriceMajor,
      discountType: params.discountType,
    }),
  }
  return body
}

export function formatGrabCampaignApiError(err: unknown): string {
  const raw = String(err ?? '')
  const jsonStart = raw.indexOf('{')
  if (jsonStart < 0) return raw
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      message?: string
      reason?: string
      errors?: Array<{ message?: string; reason?: string }>
    }
    const parts = [
      parsed.message,
      parsed.reason,
      ...(parsed.errors || []).map((e) => e.message || e.reason),
    ].filter(Boolean)
    if (parts.length) return parts.join(' | ')
  } catch {
    // ignore
  }
  return raw
}

type GrabCampaignErrorCode =
  | 'ITEMS_NOT_FOUND'
  | 'START_TIME_INVALID'
  | 'EFFECTIVE_DATE_OVERLAP'
  | 'INVALID_DISCOUNT_VALUE'
  | 'INVALID_QUOTAS'
  | 'ACTIVE_LIMIT_EXCEEDED'
  | 'UNKNOWN'

export function classifyGrabCampaignApiError(err: unknown): GrabCampaignErrorCode {
  const msg = formatGrabCampaignApiError(err).toLowerCase()
  if (msg.includes('items not found')) return 'ITEMS_NOT_FOUND'
  if (
    msg.includes('starttime has to be after now') ||
    msg.includes('campaign_start_time_too_close_to_now') ||
    msg.includes('start time too close')
  ) {
    return 'START_TIME_INVALID'
  }
  if (msg.includes('effective_date_overlap')) return 'EFFECTIVE_DATE_OVERLAP'
  if (msg.includes('invalid_discount_value')) return 'INVALID_DISCOUNT_VALUE'
  if (msg.includes('invalid_quotas')) return 'INVALID_QUOTAS'
  if (msg.includes('exceed_active_campaign_max_limit')) return 'ACTIVE_LIMIT_EXCEEDED'
  return 'UNKNOWN'
}

function extractCampaignTimeDebug(body: Record<string, unknown>): {
  startTimeUtc: string
  endTimeUtc: string
  startTimeBkk: string
  endTimeBkk: string
} {
  const conditions = (body.conditions && typeof body.conditions === 'object'
    ? body.conditions
    : {}) as Record<string, unknown>
  const startTimeUtc = String(conditions.startTime ?? '').trim()
  const endTimeUtc = String(conditions.endTime ?? '').trim()
  const startTimeBkk = startTimeUtc ? getBangkokRequestDtIso(new Date(startTimeUtc)) : ''
  const endTimeBkk = endTimeUtc ? getBangkokRequestDtIso(new Date(endTimeUtc)) : ''
  return { startTimeUtc, endTimeUtc, startTimeBkk, endTimeBkk }
}

function buildOptionsByMenuId(options: OptionRow[]): Record<string, PromoOptionLike[]> {
  const out: Record<string, PromoOptionLike[]> = {}
  for (const opt of options) {
    const menuId = String(opt.menu_id ?? '').trim()
    if (!menuId) continue
    if (!out[menuId]) out[menuId] = []
    out[menuId].push({
      id: String(opt.id ?? ''),
      priceModifier: Number(opt.price_modifier ?? 0),
      priceModifierDelivery:
        opt.price_modifier_delivery != null ? Number(opt.price_modifier_delivery) : null,
    })
  }
  return out
}

async function loadPromoBundle(): Promise<{
  promos: PromoRow[]
  itemsByPromoId: Map<number, PromoItemRow[]>
  mirrorByPromoId: Map<number, MirrorMenuRow>
  menus: MenuPriceRow[]
  optionsByMenuId: Record<string, PromoOptionLike[]>
}> {
  const [promos, promoItems, mirrorMenus, menus, options] = await Promise.all([
    supabaseSelectAllPages('pos_promos', {
      select:
        'id,code,name,price,price_delivery,is_active,channel_delivery,delivery_app_codes,valid_from,valid_to',
      pageSize: 2000,
      order: 'id.asc',
    }).catch(() => []) as Promise<PromoRow[]>,
    supabaseSelectAllPages('pos_promo_items', {
      select: 'promo_id,menu_id,option_id,quantity',
      pageSize: 5000,
      order: 'promo_id.asc,sort_order.asc',
    }).catch(() => []) as Promise<PromoItemRow[]>,
    supabaseSelectFilterAllPages('pos_menus', 'promo_id=not.is.null', {
      select: 'id,code,promo_id,sell_delivery,is_active',
      pageSize: 3000,
      order: 'id.asc',
    }).catch(() => []) as Promise<MirrorMenuRow[]>,
    supabaseSelectAllPages('pos_menus', {
      select: 'id,price,price_delivery',
      pageSize: 3000,
      order: 'id.asc',
    }).catch(() => []) as Promise<MenuPriceRow[]>,
    supabaseSelectAllPages('pos_menu_options', {
      select: 'id,menu_id,price_modifier,price_modifier_delivery',
      pageSize: 5000,
      order: 'menu_id.asc',
    }).catch(() => []) as Promise<OptionRow[]>,
  ])

  const itemsByPromoId = new Map<number, PromoItemRow[]>()
  for (const row of promoItems || []) {
    const pid = Number(row.promo_id ?? 0)
    if (!pid) continue
    const list = itemsByPromoId.get(pid) || []
    list.push(row)
    itemsByPromoId.set(pid, list)
  }

  const mirrorByPromoId = new Map<number, MirrorMenuRow>()
  for (const row of mirrorMenus || []) {
    const pid = Number(row.promo_id ?? 0)
    if (!pid) continue
    mirrorByPromoId.set(pid, row)
  }

  return {
    promos: Array.isArray(promos) ? promos : [],
    itemsByPromoId,
    mirrorByPromoId,
    menus: Array.isArray(menus) ? menus : [],
    optionsByMenuId: buildOptionsByMenuId(Array.isArray(options) ? options : []),
  }
}

export type GrabPromoCutPriceTarget = {
  promoId: number
  grabItemId: string
  salePrice: number
  regularPrice: number
  promoName: string
  validFrom: string | null
  validTo: string | null
}

function isPromoExpiredForGrab(validTo: string | null | undefined, businessDateYmd: string): boolean {
  const to = String(validTo ?? '').trim()
  if (!to) return false
  return businessDateYmd > to
}

/**
 * Grab 컷프라이스 대상 프로모 수집.
 * `immediateDisplay`(기본 true): ERP 시작일(valid_from) 전이어도 세트·프로모 포함(만료 valid_to만 제외).
 */
export function collectGrabPromoCutPriceTargets(
  bundle: Awaited<ReturnType<typeof loadPromoBundle>>,
  options?: { immediateDisplay?: boolean; businessDateYmd?: string }
): GrabPromoCutPriceTarget[] {
  const businessDateYmd = options?.businessDateYmd ?? bangkokDateStrISO()
  const immediateDisplay = options?.immediateDisplay !== false
  const menuRows = bundle.menus.map((m) => ({
    id: String(m.id ?? ''),
    price: Number(m.price ?? 0),
    priceDelivery: m.price_delivery != null ? Number(m.price_delivery) : null,
  }))
  const targets: GrabPromoCutPriceTarget[] = []

  for (const promo of bundle.promos) {
    const promoId = Number(promo.id ?? 0)
    if (!promoId || promo.is_active === false) continue
    if (isPromoExpiredForGrab(promo.valid_to, businessDateYmd)) continue

    const mirror = bundle.mirrorByPromoId.get(promoId)
    if (!mirror || mirror.is_active === false || mirror.sell_delivery === false) continue
    if (promo.channel_delivery === false) continue
    if (!isPromoEligibleForGrabDeliveryApp(promo.delivery_app_codes)) continue

    if (!immediateDisplay) {
      const visible = isPromoVisibleInContext(
        {
          isActive: true,
          validFrom: promo.valid_from ?? null,
          validTo: promo.valid_to ?? null,
          channelHall: true,
          channelTakeout: true,
          channelDelivery: true,
          deliveryAppCodes: promo.delivery_app_codes ?? null,
        },
        { businessDateYmd, orderType: 'delivery', deliveryAppCode: 'grab' }
      )
      if (!visible) continue
    }

    const itemRows = bundle.itemsByPromoId.get(promoId) || []
    const pricingItems = promoItemsToPricingLines(itemRows)
    if (!pricingItems.length) continue

    const salePrice =
      promo.price_delivery != null && Number.isFinite(Number(promo.price_delivery))
        ? Number(promo.price_delivery)
        : Number(promo.price ?? 0)
    const regularPrice = calcPromoRegularPriceForGrabCut({
      items: pricingItems,
      menus: menuRows,
      optionsByMenuId: bundle.optionsByMenuId,
    })
    const cut = resolvePromoCutPrice({ salePrice, regularPrice })
    if (!cut.showCutPrice) continue

    targets.push({
      promoId,
      grabItemId: buildGrabMenuItemId(mirror),
      salePrice: cut.salePrice,
      regularPrice: cut.regularPrice,
      promoName: String(promo.name ?? promo.code ?? '').trim(),
      validFrom: promo.valid_from ? String(promo.valid_from).slice(0, 10) : null,
      validTo: promo.valid_to ? String(promo.valid_to).slice(0, 10) : null,
    })
  }

  return targets
}

async function pushGrabMenuRecordForCutTarget(
  merchantID: string,
  target: GrabPromoCutPriceTarget
): Promise<boolean> {
  const cut = resolvePromoCutPrice({
    salePrice: target.salePrice,
    regularPrice: target.regularPrice,
  })
  if (!cut.showCutPrice) return false
  const regularMinor = Math.max(1, Math.round(cut.regularPrice * 100))
  const saleMinor = Math.max(1, Math.round(cut.salePrice * 100))
  if (regularMinor <= saleMinor) return false
  await grabUpdateMenuRecord({
    merchantID,
    field: 'ITEM',
    id: target.grabItemId,
    price: regularMinor,
    advancedPricings: GRAB_DELIVERY_ON_APP_PRICING_KEYS.map((key) => ({
      key,
      price: saleMinor,
    })),
  })
  return true
}

/** 모든 세트·프로모 컷프라이스(정가+할인가)를 Grab 메뉴에 즉시 push */
export async function pushGrabPromoCutPriceMenuRecords(params: {
  merchantID: string
  targets?: GrabPromoCutPriceTarget[]
}): Promise<{ pushed: number; failed: number; targets: number }> {
  const merchantID = String(params.merchantID || '').trim()
  if (!merchantID) return { pushed: 0, failed: 0, targets: 0 }

  const targets =
    params.targets ??
    collectGrabPromoCutPriceTargets(await loadPromoBundle(), { immediateDisplay: true })

  let pushed = 0
  let failed = 0
  for (const target of targets) {
    try {
      if (await pushGrabMenuRecordForCutTarget(merchantID, target)) pushed += 1
    } catch (e) {
      failed += 1
      console.warn('[grab-promo-campaign] push_menu_record_failed', {
        merchantID,
        grabItemId: target.grabItemId,
        error: String(e),
      })
    }
  }
  return { pushed, failed, targets: targets.length }
}

export async function listGrabManagedPromoCampaigns(merchantID: string): Promise<
  Array<{
    id: string
    name: string
    section: 'ongoing' | 'upcoming'
    discountType: string
    discountValue: number
    itemIds: string[]
    startTimeUtc: string
    endTimeUtc: string
    startTimeBkk: string
    endTimeBkk: string
  }>
> {
  const id = String(merchantID || '').trim()
  if (!id) return []
  const listed = await grabJsonRequest<unknown>({
    path: '/partner/v1/campaigns',
    method: 'GET',
    query: { merchantID: id },
  })
  const out: Array<{
    id: string
    name: string
    section: 'ongoing' | 'upcoming'
    discountType: string
    discountValue: number
    itemIds: string[]
    startTimeUtc: string
    endTimeUtc: string
    startTimeBkk: string
    endTimeBkk: string
  }> = []
  if (!listed || typeof listed !== 'object') return out
  const root = listed as Record<string, unknown>
  for (const section of ['ongoing', 'upcoming'] as const) {
    const rows = Array.isArray(root[section]) ? root[section] : []
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as GrabCampaignListRow & { conditions?: { startTime?: string; endTime?: string } }
      const name = String(row.name ?? '').trim()
      if (!name.startsWith(CAMPAIGN_NAME_PREFIX)) continue
      const times = extractCampaignTimeDebug({ conditions: row.conditions ?? {} })
      out.push({
        id: String(row.id ?? '').trim(),
        name,
        section,
        discountType: String(row.discount?.type ?? '').trim(),
        discountValue: Math.round(Number(row.discount?.value ?? 0)),
        itemIds: row.discount?.scope?.objectIDs ?? [],
        startTimeUtc: times.startTimeUtc,
        endTimeUtc: times.endTimeUtc,
        startTimeBkk: times.startTimeBkk,
        endTimeBkk: times.endTimeBkk,
      })
    }
  }
  return out
}

async function createGrabCampaign(body: Record<string, unknown>): Promise<void> {
  await grabJsonRequest({
    path: '/partner/v1/campaigns',
    method: 'POST',
    body,
  })
}

async function updateGrabCampaign(existingId: string, body: Record<string, unknown>): Promise<void> {
  await grabJsonRequest({
    path: `/partner/v1/campaigns/${encodeURIComponent(existingId)}`,
    method: 'PUT',
    body,
    expectNoContentOk: true,
  })
}

/** PUT 시 ongoing(이미 시작) 캠페인은 startTime/endTime 제외 — Grab이 과거 startTime PUT 거절함 */
export function buildPutBodyForExistingGrabCampaign(
  freshBody: Record<string, unknown>,
  existingRow: GrabCampaignListRow,
  section?: 'ongoing' | 'upcoming'
): Record<string, unknown> {
  const existingStart = String(existingRow.conditions?.startTime ?? '').trim()
  const startMs = existingStart ? new Date(existingStart).getTime() : NaN
  const alreadyStarted = Number.isFinite(startMs) && startMs <= Date.now()
  if (section !== 'ongoing' && !alreadyStarted) {
    return preserveGrabCampaignScheduleInBody(freshBody, existingRow)
  }
  const conditions = (freshBody.conditions && typeof freshBody.conditions === 'object'
    ? { ...(freshBody.conditions as Record<string, unknown>) }
    : {}) as Record<string, unknown>
  delete conditions.startTime
  delete conditions.endTime
  return { ...freshBody, conditions }
}

/** ongoing/upcoming 캠페인 갱신 시 startTime 유지 (아직 시작 전 upcoming 전용) */
function preserveGrabCampaignScheduleInBody(
  body: Record<string, unknown>,
  existingRow: GrabCampaignListRow
): Record<string, unknown> {
  const startTime = String(existingRow.conditions?.startTime ?? '').trim()
  if (!startTime) return body
  const conditions = (body.conditions && typeof body.conditions === 'object'
    ? body.conditions
    : {}) as Record<string, unknown>
  const endTime = String(existingRow.conditions?.endTime ?? conditions.endTime ?? '').trim()
  return {
    ...body,
    conditions: {
      ...conditions,
      startTime,
      ...(endTime ? { endTime } : {}),
    },
  }
}

/** DELETE 후 POST — POST 실패 시 fixPrice fallback으로 복구 */
async function replaceGrabCampaign(params: {
  existingId?: string
  body: Record<string, unknown>
  fallbackBody?: Record<string, unknown>
}): Promise<{ usedFallback: boolean }> {
  const existingId = String(params.existingId ?? '').trim()
  if (existingId) {
    await grabJsonRequest({
      path: `/partner/v1/campaigns/${encodeURIComponent(existingId)}`,
      method: 'DELETE',
      expectNoContentOk: true,
    })
  }
  try {
    await createGrabCampaign(params.body)
    return { usedFallback: false }
  } catch (e) {
    if (!params.fallbackBody) throw e
    await createGrabCampaign(params.fallbackBody)
    return { usedFallback: true }
  }
}

const GRAB_CAMPAIGN_EXTENDED_START_LEAD_MINUTES = 65

/** 캠페인 생성·교체 — force 시에만 DELETE+POST, 평소 PUT(시작 시각 유지) */
async function upsertGrabPromoCampaignForTarget(params: {
  existingId?: string
  existingRow?: GrabCampaignListRow
  campaignSection?: 'ongoing' | 'upcoming'
  forceReplace?: boolean
  buildBody: (opts?: {
    leadMinutes?: number
    discountType?: GrabPromoCampaignDiscountType
  }) => Record<string, unknown>
  initialLeadMinutes?: number
}): Promise<{ usedFallback: boolean; usedExtendedLead: boolean; mode: 'created' | 'updated' | 'replaced' }> {
  const existingId = String(params.existingId ?? '').trim()
  const forceReplace = params.forceReplace === true
  const section = params.campaignSection

  const postNew = async (leadMinutes: number, discountType?: GrabPromoCampaignDiscountType) => {
    const body = params.buildBody({ leadMinutes, discountType })
    try {
      await createGrabCampaign(body)
      return { usedFallback: false }
    } catch (e) {
      if (discountType === 'fixPrice') throw e
      await createGrabCampaign(params.buildBody({ leadMinutes, discountType: 'fixPrice' }))
      return { usedFallback: true }
    }
  }

  if (existingId && !forceReplace) {
    const putBody = buildPutBodyForExistingGrabCampaign(
      params.buildBody(),
      params.existingRow ?? { id: existingId },
      section
    )
    try {
      await updateGrabCampaign(existingId, putBody)
      return { usedFallback: false, usedExtendedLead: false, mode: 'updated' }
    } catch (e) {
      if (classifyGrabCampaignApiError(e) === 'START_TIME_INVALID') {
        const discountOnly = buildPutBodyForExistingGrabCampaign(
          params.buildBody(),
          params.existingRow ?? { id: existingId },
          'ongoing'
        )
        await updateGrabCampaign(existingId, discountOnly)
        return { usedFallback: false, usedExtendedLead: false, mode: 'updated' }
      }
      /** ongoing은 시작 시각 보존 — DELETE+POST 금지(Now 취소선 유지) */
      if (section === 'ongoing') throw e
      console.warn('[grab-promo-campaign] put_failed_try_replace', {
        existingId,
        error: String(e),
      })
      const leadMs = getGrabCampaignStartLeadMs(params.initialLeadMinutes, { immediatePromoDisplay: true })
      const leadMinutes = leadMs / 60_000
      const body = params.buildBody({ leadMinutes })
      const primaryType = (body.discount as { type?: string })?.type
      const result = await replaceGrabCampaign({
        existingId,
        body,
        fallbackBody:
          primaryType === 'percentage'
            ? params.buildBody({ leadMinutes, discountType: 'fixPrice' })
            : undefined,
      })
      return { ...result, usedExtendedLead: false, mode: 'replaced' }
    }
  }

  if (existingId && forceReplace) {
    const leadMs = getGrabCampaignStartLeadMs(params.initialLeadMinutes, { immediatePromoDisplay: true })
    const leadMinutes = leadMs / 60_000
    const body = params.buildBody({ leadMinutes })
    const primaryType = (body.discount as { type?: string })?.type
    const result = await replaceGrabCampaign({
      existingId,
      body,
      fallbackBody:
        primaryType === 'percentage'
          ? params.buildBody({ leadMinutes, discountType: 'fixPrice' })
          : undefined,
    })
    return { ...result, usedExtendedLead: false, mode: 'replaced' }
  }

  const leadMs = getGrabCampaignStartLeadMs(params.initialLeadMinutes, { immediatePromoDisplay: true })
  try {
    const result = await postNew(leadMs / 60_000)
    return { ...result, usedExtendedLead: false, mode: 'created' }
  } catch (e) {
    if (
      classifyGrabCampaignApiError(e) !== 'START_TIME_INVALID' ||
      leadMs >= GRAB_CAMPAIGN_EXTENDED_START_LEAD_MINUTES * 60_000
    ) {
      throw e
    }
    const extendedLead = GRAB_CAMPAIGN_EXTENDED_START_LEAD_MINUTES
    try {
      const result = await postNew(extendedLead)
      return { ...result, usedExtendedLead: true, mode: 'created' }
    } catch {
      const result = await postNew(extendedLead, 'fixPrice')
      return { ...result, usedExtendedLead: true, mode: 'created' }
    }
  }
}

function listCampaignRows(payload: unknown): GrabCampaignListRow[] {
  if (!payload || typeof payload !== 'object') return []
  const o = payload as Record<string, unknown>
  const ongoing = Array.isArray(o.ongoing) ? o.ongoing : []
  const upcoming = Array.isArray(o.upcoming) ? o.upcoming : []
  return [...ongoing, ...upcoming].filter((r) => r && typeof r === 'object') as GrabCampaignListRow[]
}

export async function syncGrabPromoTargetPriceCampaigns(params: {
  merchantID: string
  /** true면 Grab에 동일 캠페인이 있어도 삭제 후 재생성(메뉴 item id 변경·표시 불일치 우회) */
  force?: boolean
  /** fixPrice→percentage 등 할인 타입 불일치 시 skip 하지 않고 PUT 마이그레이션 */
  migrateDiscountType?: boolean
  /** 이번 sync만 사용할 할인 타입(미지정 시 env·기본 percentage) */
  campaignDiscountType?: GrabPromoCampaignDiscountType
  /** 분 단위 캠페인 시작 리드타임(미지정 시 immediate면 5분, Grab 거절 시 65분 재시도) */
  campaignStartLeadMinutes?: number
  /** true(기본): 메뉴 컷프라이스 push 대상 — valid_from 전 프로모 포함. 캠페인 날짜는 ERP 그대로 */
  immediatePromoDisplay?: boolean
}): Promise<{
  created: number
  updated: number
  skipped: number
  deleted: number
  targets: number
  menuRecordsPushed: number
  menuRecordsFailed: number
  campaignErrors: Array<{ promoId: number; grabItemId: string; error: string; errorCode?: string }>
  campaignFallbackUsed: number
  campaignDiscountMigrated: number
}> {
  const merchantID = String(params.merchantID || '').trim()
  const force = params.force === true
  const migrateDiscountType = params.migrateDiscountType === true
  const campaignDiscountType = params.campaignDiscountType
  const immediatePromoDisplay = params.immediatePromoDisplay !== false
  const empty = {
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    targets: 0,
    menuRecordsPushed: 0,
    menuRecordsFailed: 0,
    campaignErrors: [] as Array<{ promoId: number; grabItemId: string; error: string; errorCode?: string }>,
    campaignFallbackUsed: 0,
    campaignDiscountMigrated: 0,
  }
  if (!merchantID) return empty

  const bundle = await loadPromoBundle()
  const targets = collectGrabPromoCutPriceTargets(bundle, { immediateDisplay: immediatePromoDisplay })
  const campaignLeadMinutes =
    params.campaignStartLeadMinutes ??
    (immediatePromoDisplay ? GRAB_CAMPAIGN_IMMEDIATE_START_LEAD_MS / 60_000 : undefined)

  let existing: GrabCampaignListRow[] = []
  let existingByPrefix = new Map<string, IndexedGrabCampaign>()
  try {
    const listed = await grabJsonRequest<unknown>({
      path: '/partner/v1/campaigns',
      method: 'GET',
      query: { merchantID },
    })
    existing = listCampaignRows(listed)
    existingByPrefix = indexManagedCampaigns(listed)
  } catch (e) {
    console.warn('[grab-promo-campaign] list_failed', { merchantID, error: String(e) })
    return {
      ...empty,
      skipped: targets.length,
      targets: targets.length,
    }
  }

  const existingByName = new Map<string, GrabCampaignListRow>()
  for (const row of existing) {
    const name = String(row.name ?? '').trim()
    if (name.startsWith(CAMPAIGN_NAME_PREFIX)) existingByName.set(name, row)
  }

  let created = 0
  let updated = 0
  let skipped = 0
  let campaignDiscountMigrated = 0
  let campaignFallbackUsed = 0
  const campaignErrors: Array<{ promoId: number; grabItemId: string; error: string; errorCode?: string }> = []
  const keepNames = new Set<string>()

  /** Grab 손님 앱: item.price=정가·advancedPricing=할인가를 캠페인 전에 먼저 push */
  const menuPushBefore = await pushGrabPromoCutPriceMenuRecords({ merchantID, targets })

  for (const target of targets) {
    const campaignName = buildGrabPromoCampaignName(target.promoId)
    keepNames.add(campaignName)
    const buildBody = (opts?: { leadMinutes?: number; discountType?: GrabPromoCampaignDiscountType }) =>
      buildGrabTargetPriceCampaignBody({
        merchantID,
        promoId: target.promoId,
        promoName: target.promoName,
        grabItemId: target.grabItemId,
        salePriceMajor: target.salePrice,
        regularPriceMajor: target.regularPrice,
        validFrom: target.validFrom,
        validTo: target.validTo,
        campaignStartLeadMinutes: opts?.leadMinutes ?? campaignLeadMinutes,
        clampCampaignValidFromToToday: immediatePromoDisplay,
        discountType: opts?.discountType ?? campaignDiscountType,
      })
    const primaryBody = buildBody()
    const indexed =
      existingByPrefix.get(campaignName) ||
      (() => {
        const row =
          existingByName.get(campaignName) ||
          existing.find((r) => String(r.name ?? '').startsWith(campaignName))
        if (!row) return undefined
        const id = String(row.id ?? '').trim()
        let section: 'ongoing' | 'upcoming' = 'upcoming'
        for (const val of existingByPrefix.values()) {
          if (String(val.row.id ?? '').trim() === id) {
            section = val.section
            break
          }
        }
        return { row, section }
      })()
    const hit = indexed?.row
    const discountType = campaignDiscountType ?? resolveGrabPromoCampaignDiscountType()
    const needsTypeMigration =
      hit?.id && migrateDiscountType && grabCampaignNeedsDiscountTypeMigration(hit, discountType)
    const matches =
      hit?.id &&
      !force &&
      !needsTypeMigration &&
      grabCampaignDiscountMatchesTarget(hit, {
        grabItemId: target.grabItemId,
        salePriceMajor: target.salePrice,
        regularPriceMajor: target.regularPrice,
        discountType,
      })

    if (matches) {
      skipped += 1
      continue
    }

    try {
      const result = await upsertGrabPromoCampaignForTarget({
        existingId: hit?.id ? String(hit.id) : undefined,
        existingRow: hit,
        campaignSection: indexed?.section,
        forceReplace: force,
        buildBody: (opts) => buildBody(opts),
        initialLeadMinutes: campaignLeadMinutes,
      })
      if (result.usedFallback) campaignFallbackUsed += 1
      if (needsTypeMigration) campaignDiscountMigrated += 1
      if (result.mode === 'updated') updated += 1
      else created += 1
    } catch (e) {
      skipped += 1
      const errorCode = classifyGrabCampaignApiError(e)
      const errorMessage = formatGrabCampaignApiError(e)
      campaignErrors.push({
        promoId: target.promoId,
        grabItemId: target.grabItemId,
        error: errorMessage,
        errorCode,
      })
      console.warn('[grab-promo-campaign] upsert_failed', {
        merchantID,
        promoId: target.promoId,
        grabItemId: target.grabItemId,
        ...extractCampaignTimeDebug(primaryBody),
        errorCode,
        error: errorMessage,
      })
    }
  }

  let deleted = 0
  for (const row of existing) {
    const name = String(row.name ?? '').trim()
    if (!name.startsWith(CAMPAIGN_NAME_PREFIX)) continue
    const prefix = name.split(' ')[0]
    if (keepNames.has(prefix)) continue
    const id = String(row.id ?? '').trim()
    if (!id) continue
    try {
      await grabJsonRequest({
        path: `/partner/v1/campaigns/${encodeURIComponent(id)}`,
        method: 'DELETE',
        expectNoContentOk: true,
      })
      deleted += 1
    } catch (e) {
      console.warn('[grab-promo-campaign] delete_stale_failed', { merchantID, id, error: String(e) })
    }
  }

  const menuPushAfter = await pushGrabPromoCutPriceMenuRecords({ merchantID, targets })

  return {
    created,
    updated,
    skipped,
    deleted,
    targets: targets.length,
    menuRecordsPushed: menuPushBefore.pushed + menuPushAfter.pushed,
    menuRecordsFailed: menuPushBefore.failed + menuPushAfter.failed,
    campaignErrors,
    campaignFallbackUsed,
    campaignDiscountMigrated,
  }
}

/** 메뉴 빌드용: promo_id → 정가·할인가 (Grab 메뉴 item price = 정가) */
export async function loadGrabPromoCutPriceByPromoId(): Promise<
  Map<
    number,
    {
      salePrice: number
      regularPrice: number
      showCutPrice: boolean
    }
  >
> {
  const bundle = await loadPromoBundle()
  const out = new Map<number, { salePrice: number; regularPrice: number; showCutPrice: boolean }>()
  for (const target of collectGrabPromoCutPriceTargets(bundle, { immediateDisplay: true })) {
    out.set(target.promoId, {
      salePrice: target.salePrice,
      regularPrice: target.regularPrice,
      showCutPrice: true,
    })
  }
  return out
}
