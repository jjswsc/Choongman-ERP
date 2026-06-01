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
/** Grab Create Campaign: startTime은 “지금+리드타임” 이후 (너무 가까우면 START_TIME_INVALID) */
const GRAB_CAMPAIGN_DEFAULT_START_LEAD_MS = 65 * 60_000
const GRAB_CAMPAIGN_IMMEDIATE_START_LEAD_MS = 5 * 60_000
const GRAB_CAMPAIGN_MIN_ALLOWED_START_LEAD_MS = 5 * 60_000
const GRAB_CAMPAIGN_MAX_ALLOWED_START_LEAD_MS = 120 * 60_000

/** Vercel `GRAB_CAMPAIGN_START_LEAD_MINUTES`. immediate면 기본 5분, 아니면 65분. Grab 거절 시 65분 재시도 */
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
}

type IndexedGrabCampaign = {
  row: GrabCampaignListRow
  section: 'ongoing' | 'upcoming'
}

export function grabCampaignDiscountMatchesTarget(
  row: GrabCampaignListRow,
  target: { grabItemId: string; salePriceMajor: number }
): boolean {
  const discount = row.discount
  if (!discount || String(discount.type ?? '').trim() !== 'fixPrice') return false
  if (Math.round(Number(discount.value ?? 0)) !== Math.round(target.salePriceMajor)) return false
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
  validFrom?: string | null
  validTo?: string | null
  /** 분 단위 start 리드타임(Grab 즉시 반영 시도용, 기본 env·65분) */
  campaignStartLeadMinutes?: number
  /** true면 valid_from을 오늘로 당겨 캠페인·미리보기를 당일부터 */
  immediatePromoDisplay?: boolean
}): Record<string, unknown> {
  const immediate = params.immediatePromoDisplay !== false
  const { startMs, endMs } = resolveGrabCampaignScheduleMs({
    validFrom: params.validFrom,
    validTo: params.validTo,
    startLeadMinutes: params.campaignStartLeadMinutes,
    clampValidFromToToday: immediate,
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
    discount: {
      type: 'fixPrice',
      value: Math.round(params.salePriceMajor),
      scope: {
        type: 'items',
        objectIDs: [params.grabItemId],
      },
    },
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
    msg.includes('campaign_start_time_too_close_to_now')
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
  /** 분 단위 캠페인 시작 리드타임(미지정 시 immediate면 5분, Grab 거절 시 65분 재시도) */
  campaignStartLeadMinutes?: number
  /** true(기본): 모든 활성 Grab 프로모·세트 컷프라이스 즉시 push + 캠페인 시작일 오늘까지 */
  immediatePromoDisplay?: boolean
}): Promise<{
  created: number
  updated: number
  skipped: number
  deleted: number
  targets: number
  menuRecordsPushed: number
  menuRecordsFailed: number
}> {
  const merchantID = String(params.merchantID || '').trim()
  const force = params.force === true
  const immediatePromoDisplay = params.immediatePromoDisplay !== false
  if (!merchantID) return { created: 0, updated: 0, skipped: 0, deleted: 0, targets: 0, menuRecordsPushed: 0, menuRecordsFailed: 0 }

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
    return { created: 0, updated: 0, skipped: targets.length, deleted: 0, targets: targets.length, menuRecordsPushed: 0, menuRecordsFailed: 0 }
  }

  const existingByName = new Map<string, GrabCampaignListRow>()
  for (const row of existing) {
    const name = String(row.name ?? '').trim()
    if (name.startsWith(CAMPAIGN_NAME_PREFIX)) existingByName.set(name, row)
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const keepNames = new Set<string>()

  const menuPushBefore = await pushGrabPromoCutPriceMenuRecords({ merchantID, targets })
  let menuRecordsPushed = menuPushBefore.pushed
  let menuRecordsFailed = menuPushBefore.failed

  for (const target of targets) {
    const campaignName = buildGrabPromoCampaignName(target.promoId)
    keepNames.add(campaignName)
    const buildBody = (leadMinutes?: number) =>
      buildGrabTargetPriceCampaignBody({
        merchantID,
        promoId: target.promoId,
        promoName: target.promoName,
        grabItemId: target.grabItemId,
        salePriceMajor: target.salePrice,
        validFrom: target.validFrom,
        validTo: target.validTo,
        campaignStartLeadMinutes: leadMinutes ?? campaignLeadMinutes,
        immediatePromoDisplay,
      })
    let body = buildBody()
    const fullName = String(body.name ?? '')
    const indexed =
      existingByPrefix.get(campaignName) ||
      (() => {
        const row =
          existingByName.get(campaignName) ||
          existing.find((r) => String(r.name ?? '').startsWith(campaignName))
        if (!row) return undefined
        return { row, section: 'upcoming' as const }
      })()
    const hit = indexed?.row

    try {
      if (hit?.id) {
        if (
          !force &&
          grabCampaignDiscountMatchesTarget(hit, {
            grabItemId: target.grabItemId,
            salePriceMajor: target.salePrice,
          })
        ) {
          skipped += 1
          continue
        }
        if (force || indexed?.section === 'ongoing') {
          await grabJsonRequest({
            path: `/partner/v1/campaigns/${encodeURIComponent(String(hit.id))}`,
            method: 'DELETE',
            expectNoContentOk: true,
          })
          await grabJsonRequest({
            path: '/partner/v1/campaigns',
            method: 'POST',
            body,
          })
          created += 1
          continue
        }
        await grabJsonRequest({
          path: `/partner/v1/campaigns/${encodeURIComponent(String(hit.id))}`,
          method: 'PUT',
          body,
          expectNoContentOk: true,
        })
        updated += 1
      } else {
        await grabJsonRequest({
          path: '/partner/v1/campaigns',
          method: 'POST',
          body,
        })
        created += 1
      }
    } catch (e) {
      let errorCode = classifyGrabCampaignApiError(e)
      const leadMinutesUsed = getGrabCampaignStartLeadMs(campaignLeadMinutes, { immediatePromoDisplay })
      if (errorCode === 'START_TIME_INVALID' && leadMinutesUsed < 65) {
        try {
          body = buildBody(65)
          await grabJsonRequest({ path: '/partner/v1/campaigns', method: 'POST', body })
          created += 1
          continue
        } catch (retryErr) {
          e = retryErr
          errorCode = classifyGrabCampaignApiError(retryErr)
        }
      }
      skipped += 1
      const errorMessage = formatGrabCampaignApiError(e)
      const timeDebug = extractCampaignTimeDebug(body)
      console.warn('[grab-promo-campaign] upsert_failed', {
        merchantID,
        promoId: target.promoId,
        grabItemId: target.grabItemId,
        salePriceMajor: target.salePrice,
        campaignName: fullName,
        ...timeDebug,
        errorCode,
        error: errorMessage,
        actionHint:
          errorCode === 'ITEMS_NOT_FOUND'
            ? 'check_menu_sync_success_and_merchant_match'
            : errorCode === 'START_TIME_INVALID'
              ? 'regenerate_payload_with_fresh_start_time'
              : errorCode === 'EFFECTIVE_DATE_OVERLAP'
                ? 'delete_or_adjust_existing_campaign_period'
                : undefined,
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
  menuRecordsPushed += menuPushAfter.pushed
  menuRecordsFailed += menuPushAfter.failed

  return { created, updated, skipped, deleted, targets: targets.length, menuRecordsPushed, menuRecordsFailed }
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
