import type { PosMenu } from '@/lib/api-client'
import { buildGrabDeliveryAdvancedPricing } from '@/lib/grab-menu-advanced-pricing'
import { sanitizeGrabMenuDescription } from '@/lib/grab-menu-limits'
import { buildGrabMenuItemId } from '@/lib/grab-menu-item-id'
import {
  loadGrabPromoCutPriceByPromoId,
  resolveGrabPromoCampaignDiscountType,
} from '@/lib/grab-promo-target-price-campaign'
import { getBanbanFlavorMenuList, isBanbanMenu } from '@/lib/pos-banban-utils'
import { supabaseSelectAllPages, supabaseSelectFilter } from '@/lib/supabase-server'
import { grabStubMenuJson } from '@/lib/grab-webhook'
import { parseGrabStoreMap } from '@/lib/grab-store-map-env'
import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import { normStoreKey } from '@/lib/store-list-keys'
import {
  type PosOptionGroupRow,
  buildMenuOptionsFromLinksPerGroup,
  buildSelectionConfigFromLinks,
  loadMenuGroupLinks,
  loadPosOptionGroupsWithItems,
} from '@/lib/pos-option-groups-server'
import {
  formatGrabModifierOptionDisplayName,
  resolveGrabModifierAssignments,
  shouldIncludeStandaloneOptionForLinkedMenu,
} from '@/lib/grab-option-modifier-assign'
import {
  buildCategoryOrderMap,
  buildMenuPolicyMap,
  getPosDeliveryPolicyBundle,
  isMenuAvailableByDeliveryPolicy,
  type PosDeliveryMenuPolicy,
  type PosDeliveryPolicyBundle,
} from '@/lib/pos-delivery-policy'

function isGrabAdvancedPricingFallbackEnabled(): boolean {
  const raw = String(process.env.GRAB_MENU_ADVANCED_PRICING_FALLBACK || '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/** `GRAB_MENU_ADVANCED_PRICING_FALLBACK=0|false` 일 때만 컷프라이스 advancedPricing 생략 */
function isGrabAdvancedPricingExplicitlyDisabled(): boolean {
  const raw = String(process.env.GRAB_MENU_ADVANCED_PRICING_FALLBACK || '')
    .trim()
    .toLowerCase()
  return raw === '0' || raw === 'false' || raw === 'no' || raw === 'off'
}

type MenuRow = {
  id?: number
  code?: string
  name?: string
  category?: string
  category_main?: string
  price?: number
  price_delivery?: number | null
  image?: string | null
  vat_included?: boolean
  is_active?: boolean
  sort_order?: number
  sold_out_date?: string | null
  is_banban?: boolean
  description_default?: string
  description_delivery?: string | null
  description_table?: string | null
  sell_delivery?: boolean
  promo_id?: number | null
  banbanFlavorMenuIds?: string[]
  /** POS 옵션 그룹 규칙 (Grab modifierGroups selectionRange에 반영) */
  option_selection_config?: unknown
}

type OptionRow = {
  id?: number
  menu_id?: number
  option_code?: string | null
  name?: string
  price_modifier?: number
  price_modifier_delivery?: number | null
  sort_order?: number
  sell_delivery?: boolean
  option_step_values?: Record<string, string> | null
  description_default?: string
  description_delivery?: string | null
  description_table?: string | null
}

type TimeRange = {
  start: string
  end: string
}

type ModifierGroupBucket = {
  sourceGroupName: string
  firstSort: number
  rows: OptionRow[]
}

type OptionSelectionConfigEntry = {
  key: string
  label: string
  audience: 'all' | 'hall' | 'delivery'
  required: boolean
  minSelect: number
  maxSelect: number
}

function parseOptionSelectionConfigEntries(raw: unknown): OptionSelectionConfigEntry[] {
  if (!Array.isArray(raw)) return []
  const out: OptionSelectionConfigEntry[] = []
  for (const cfg of raw) {
    if (!cfg || typeof cfg !== 'object') continue
    const o = cfg as Record<string, unknown>
    const key = String(o.key ?? '').trim()
    if (!key) continue
    const label = String(o.label ?? '').trim() || key
    const audienceRaw = String(o.audience ?? 'all').trim().toLowerCase()
    const audience: 'all' | 'hall' | 'delivery' =
      audienceRaw === 'hall' || audienceRaw === 'delivery' ? audienceRaw : 'all'
    const required = o.required === true
    const minRaw = Number(o.minSelect)
    const maxRaw = Number(o.maxSelect)
    const minSelect = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : required ? 1 : 0
    const maxSelect = Number.isFinite(maxRaw) ? Math.max(1, Math.floor(maxRaw)) : 1
    const maxClamped = Math.max(1, maxSelect)
    const minClamped = Math.min(minSelect, maxClamped)
    out.push({ key, label, audience, required, minSelect: minClamped, maxSelect: maxClamped })
  }
  return out
}

function mergeSelectionConfigEntries(
  fromLinks: OptionSelectionConfigEntry[],
  fromColumn: OptionSelectionConfigEntry[]
): OptionSelectionConfigEntry[] {
  const byKey = new Map<string, OptionSelectionConfigEntry>()
  for (const e of fromLinks) byKey.set(e.key.trim().toLowerCase(), e)
  for (const e of fromColumn) {
    const k = e.key.trim().toLowerCase()
    if (!byKey.has(k)) byKey.set(k, e)
  }
  const order: string[] = []
  for (const e of fromLinks) {
    const k = e.key.trim().toLowerCase()
    if (k && !order.includes(k)) order.push(k)
  }
  for (const e of fromColumn) {
    const k = e.key.trim().toLowerCase()
    if (k && !order.includes(k)) order.push(k)
  }
  return order.map((k) => byKey.get(k)).filter((x): x is OptionSelectionConfigEntry => !!x)
}

/** 버킷 그룹명(옵션명 접두)과 POS에 저장한 key·label 중 하나가 같으면 규칙 적용 */
function resolveOptionSelectionConfigForBucket(
  sourceGroupName: string,
  entries: OptionSelectionConfigEntry[]
): OptionSelectionConfigEntry | null {
  if (!entries.length) return null
  const g = String(sourceGroupName || '').trim().toLowerCase()
  if (!g) return null
  for (const e of entries) {
    if (e.key.trim().toLowerCase() === g) return e
  }
  for (const e of entries) {
    if (e.label.trim().toLowerCase() === g) return e
  }
  return null
}

function grabSelectionRangeForBucket(params: {
  rows: OptionRow[]
  groupName: string
  configEntry: OptionSelectionConfigEntry | null
  forceSingleSelectLegacy: boolean
}): { min: number; max: number; groupDisplayName: string } {
  const n = params.rows.length
  const cap = Math.max(1, Math.min(10, n))
  const baseName = String(params.groupName || '').trim() || 'Options'
  if (params.configEntry) {
    const min = Math.max(0, Math.floor(params.configEntry.minSelect))
    let max = Math.max(1, Math.floor(params.configEntry.maxSelect))
    max = Math.min(max, cap)
    const minC = Math.min(min, max)
    const label = String(params.configEntry.label || '').trim()
    return {
      min: minC,
      max,
      groupDisplayName: (label || baseName).slice(0, 60),
    }
  }
  const forceSingle = params.forceSingleSelectLegacy
  return {
    min: 0,
    max: forceSingle ? 1 : cap,
    groupDisplayName: baseName.slice(0, 60),
  }
}

function normalizeCategory(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s || 'Uncategorized'
}

function normalizeId(raw: string, fallback: string): string {
  const base = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const cleaned = base.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || fallback
}

function toBanbanPosMenu(menu: MenuRow): PosMenu {
  return {
    id: String(menu.id ?? ''),
    code: String(menu.code ?? ''),
    name: String(menu.name ?? ''),
    category: String(menu.category ?? ''),
    categoryMain: String(menu.category_main ?? ''),
    price: Number(menu.price ?? 0),
    priceDelivery: menu.price_delivery != null ? Number(menu.price_delivery) : null,
    imageUrl: String(menu.image ?? ''),
    vatIncluded: menu.vat_included !== false,
    isActive: menu.is_active !== false,
    sortOrder: Number(menu.sort_order ?? 0),
    soldOutDate: menu.sold_out_date ? String(menu.sold_out_date).slice(0, 10) : null,
    isBanban: menu.is_banban === true,
    descriptionDefault: String(menu.description_default ?? ''),
    descriptionDelivery:
      menu.description_delivery == null ? null : String(menu.description_delivery),
    descriptionTable:
      menu.description_table == null ? null : String(menu.description_table),
    sellDelivery: menu.sell_delivery !== false,
    banbanFlavorMenuIds: Array.isArray(menu.banbanFlavorMenuIds) ? menu.banbanFlavorMenuIds : undefined,
  }
}

function isBanbanMenuRow(menu: MenuRow): boolean {
  return isBanbanMenu(toBanbanPosMenu(menu))
}

function isGrabBanbanFlavorAvailable(
  menu: MenuRow,
  policy: PosDeliveryMenuPolicy | undefined
): boolean {
  if (menu.is_active === false) return false
  if (menu.sell_delivery === false) return false
  if (isSoldOutDate(menu.sold_out_date)) return false
  if (policy && !policy.enabled) return false
  if (policy && !isMenuAvailableByDeliveryPolicy(policy)) return false
  return true
}

function mergeBanbanFlavorMenuIdsIntoMenus(
  menus: MenuRow[],
  rows: Array<{
    banban_menu_id?: number | null
    flavor_menu_id?: number | null
    enabled?: boolean | null
    sort_order?: number | null
  }>
): MenuRow[] {
  if (!rows.length) return menus
  const nextMenus = menus.map((menu) => ({ ...menu }))
  const menuById = new Map<number, MenuRow>()
  for (const menu of nextMenus) {
    const id = Number(menu.id ?? 0)
    if (id > 0) menuById.set(id, menu)
  }
  const sorted = [...rows]
    .filter((row) => row.enabled !== false)
    .sort((a, b) => {
      const aMenuId = Number(a.banban_menu_id || 0)
      const bMenuId = Number(b.banban_menu_id || 0)
      if (aMenuId !== bMenuId) return aMenuId - bMenuId
      const aSort = Number(a.sort_order || 0)
      const bSort = Number(b.sort_order || 0)
      if (aSort !== bSort) return aSort - bSort
      return Number(a.flavor_menu_id || 0) - Number(b.flavor_menu_id || 0)
    })
  for (const row of sorted) {
    const banbanMenuId = Number(row.banban_menu_id || 0)
    const flavorMenuId = String(row.flavor_menu_id || '').trim()
    if (!banbanMenuId || !flavorMenuId) continue
    const menu = menuById.get(banbanMenuId)
    if (!menu) continue
    const list = Array.isArray(menu.banbanFlavorMenuIds) ? [...menu.banbanFlavorMenuIds] : []
    if (!list.includes(flavorMenuId)) list.push(flavorMenuId)
    menu.banbanFlavorMenuIds = list
  }
  return nextMenus
}

function toMinorUnit(value: unknown): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function isSoldOutDate(value: unknown): boolean {
  const s = String(value ?? '').trim()
  return !!s
}

function isValidPhotoUrl(value: unknown): value is string {
  const s = String(value ?? '').trim()
  return /^https?:\/\//i.test(s)
}

function normalizeSectionName(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s || 'Regular'
}

function parseHHmm(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

function sectionSortKey(name: string): number {
  const s = String(name || '').trim().toLowerCase()
  if (s.includes('breakfast')) return 10
  if (s.includes('brunch')) return 20
  if (s.includes('lunch')) return 30
  if (s.includes('dinner')) return 40
  if (s === 'regular' || s.includes('regular')) return 50
  if (s.includes('late')) return 60
  return 100
}

function localizeGrabOptionLabel(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return s
  // Grab 앱에 한글 옵션이 노출되지 않도록 최소 치환
  s = s
    .replace(/순살/g, 'Boneless')
    .replace(/봉/g, 'Drumette')
    .replace(/윙/g, 'Wing')
  return s
}

function shouldForceSingleSelectGroup(groupName: string, rows: OptionRow[]): boolean {
  const g = String(groupName || '').trim().toLowerCase()
  // 사이즈/부위 단일 선택 그룹 (예: M/S/L)
  if (/^(xxl|xl|l|m|s)$/.test(g)) return true
  const names = rows.map((r) => String(r.name ?? '').toLowerCase())
  const hasCutChoices = names.some(
    (n) => n.includes('boneless') || n.includes('drumette') || n.includes('bone-in') || n.includes('wing')
  )
  return hasCutChoices
}

function mergeTimeRanges(ranges: TimeRange[]): TimeRange[] {
  if (ranges.length <= 1) return ranges
  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start))
  const out: TimeRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (!last) {
      out.push({ ...r })
      continue
    }
    if (r.start <= last.end) {
      if (r.end > last.end) last.end = r.end
      continue
    }
    out.push({ ...r })
  }
  return out
}

function serviceHoursFromRanges(ranges: TimeRange[]) {
  if (!ranges.length) {
    const openAllDay = {
      openPeriodType: 'OpenAllDay' as const,
    }
    return {
      mon: openAllDay,
      tue: openAllDay,
      wed: openAllDay,
      thu: openAllDay,
      fri: openAllDay,
      sat: openAllDay,
      sun: openAllDay,
    }
  }
  const normalized = mergeTimeRanges(ranges)
    .filter((r) => r.start < r.end)
    .slice(0, 4)
    .map((r) => ({
      startTime: `${r.start}:00`,
      endTime: `${r.end}:00`,
    }))
  if (!normalized.length) {
    const openAllDay = {
      openPeriodType: 'OpenAllDay' as const,
    }
    return {
      mon: openAllDay,
      tue: openAllDay,
      wed: openAllDay,
      thu: openAllDay,
      fri: openAllDay,
      sat: openAllDay,
      sun: openAllDay,
    }
  }
  const specific = {
    openPeriodType: 'SpecificTimes' as const,
    periods: normalized,
  }
  return {
    mon: specific,
    tue: specific,
    wed: specific,
    thu: specific,
    fri: specific,
    sat: specific,
    sun: specific,
  }
}

type GrabMenuSectionOut = {
  id: string
  name: string
  sequence: number
  serviceHours: ReturnType<typeof serviceHoursFromRanges>
  categories: unknown[]
}

/**
 * Grab GetMenu 문서: sellingTimes[].startTime / endTime 은 UTC이며
 * `"2023-01-09 00:00:00"` 형식(공백 구분, T/Z 없음). ISO8601 문자열은 무효 처리될 수 있음.
 */
const GRAB_SELLING_TIME_WINDOW_START = '2020-01-01 00:00:00'
const GRAB_SELLING_TIME_WINDOW_END = '2039-12-31 23:59:59'

/** Grab Menu Validation / GetMenuNewResponse: 루트 `sellingTimes` + `categories` 필수 */
function buildSellingTimesAndRootCategories(sections: GrabMenuSectionOut[]): {
  sellingTimes: Array<{
    id: string
    name: string
    startTime: string
    endTime: string
    serviceHours: GrabMenuSectionOut['serviceHours']
  }>
  categories: unknown[]
} {
  const capped = sections.slice(0, 20)
  const sellingTimes: Array<{
    id: string
    name: string
    startTime: string
    endTime: string
    serviceHours: GrabMenuSectionOut['serviceHours']
  }> = []
  const sellingTimeIdBySectionId = new Map<string, string>()
  const sellingTimeIdByHoursSignature = new Map<string, string>()
  for (const sec of capped) {
    const signature = JSON.stringify(sec.serviceHours ?? {})
    const existing = sellingTimeIdByHoursSignature.get(signature)
    if (existing) {
      sellingTimeIdBySectionId.set(sec.id, existing)
      continue
    }
    sellingTimes.push({
      id: sec.id,
      name: sec.name,
      startTime: GRAB_SELLING_TIME_WINDOW_START,
      endTime: GRAB_SELLING_TIME_WINDOW_END,
      serviceHours: sec.serviceHours,
    })
    sellingTimeIdByHoursSignature.set(signature, sec.id)
    sellingTimeIdBySectionId.set(sec.id, sec.id)
  }
  const categories: unknown[] = []
  let globalSequence = 1
  for (const sec of capped) {
    const stId = sellingTimeIdBySectionId.get(sec.id) || sec.id
    const cats = Array.isArray(sec.categories) ? sec.categories : []
    for (const raw of cats) {
      if (categories.length >= 100) break
      const cat = raw as Record<string, unknown>
      const baseId = String(cat.id ?? '').trim()
      const uniqueId = normalizeId(
        `${sec.id}__${baseId || 'cat'}`,
        `cat-${categories.length + 1}`
      )
      const row: Record<string, unknown> = {
        ...cat,
        id: uniqueId,
        sequence: globalSequence++,
        sellingTimeID: stId,
      }
      delete row.sellingTimeId
      categories.push(row)
    }
    if (categories.length >= 100) break
  }
  return { sellingTimes, categories }
}

function flattenSectionsToSingle(
  sections: Array<{
    id: string
    name: string
    sequence: number
    serviceHours: ReturnType<typeof serviceHoursFromRanges>
    categories: unknown[]
  }>
) {
  const mergedCategories: unknown[] = []
  for (const sec of sections) {
    for (const cat of sec.categories || []) mergedCategories.push(cat)
  }
  const openAllDay = serviceHoursFromRanges([])
  return [
    {
      id: 'SECTION-01',
      name: 'Menu',
      sequence: 1,
      serviceHours: openAllDay,
      categories: mergedCategories.map((cat, idx) => ({
        ...(cat as Record<string, unknown>),
        sequence: idx + 1,
      })),
    },
  ]
}

async function loadMenus(): Promise<MenuRow[]> {
  const colsAll =
    'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date,is_banban,description_default,description_delivery,description_table,sell_delivery,promo_id,option_selection_config'
  const colsAllNoConfig =
    'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,sold_out_date,is_banban,description_default,description_delivery,description_table,sell_delivery,promo_id'
  const colsWithoutDelivery =
    'id,code,name,category,category_main,price,image,vat_included,is_active,sort_order,sold_out_date,is_banban,description_default,description_delivery,description_table,sell_delivery,promo_id'
  const colsBase = 'id,code,name,category,category_main,price,is_active,sort_order,is_banban,sell_delivery,promo_id'
  for (const cols of [colsAll, colsAllNoConfig, colsWithoutDelivery, colsBase]) {
    try {
      const rows = (await supabaseSelectAllPages('pos_menus', {
        order: 'sort_order.asc,name.asc',
        pageSize: 3000,
        select: cols,
      })) as MenuRow[]
      return Array.isArray(rows) ? rows : []
    } catch {
      // try next projection
    }
  }
  return []
}

async function loadBanbanFlavorLinkRows(): Promise<
  Array<{
    banban_menu_id?: number | null
    flavor_menu_id?: number | null
    enabled?: boolean | null
    sort_order?: number | null
  }>
> {
  try {
    const rows = (await supabaseSelectAllPages('pos_banban_flavor_links', {
      order: 'banban_menu_id.asc',
      pageSize: 3000,
      select: 'banban_menu_id,flavor_menu_id,enabled,sort_order',
    })) as Array<{
      banban_menu_id?: number | null
      flavor_menu_id?: number | null
      enabled?: boolean | null
      sort_order?: number | null
    }>
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function looksLikeGrabMerchantId(raw: string): boolean {
  const s = String(raw || '').trim().toUpperCase()
  return s.startsWith('GF') || s.includes('GFSB') || s.includes('GFSBPOS')
}

/** Grab 파트너 스토어 ID(숫자)만 추출. merchantID(GFSBPOS-204-253)에는 적용하지 않음 → 204 오탐 방지 */
function extractPartnerStoreDigits(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const noPrefix = s.replace(/^partner\s*store\s*id\s*[-:]\s*/i, '').trim()
  if (/^\d{3,6}$/.test(noPrefix)) return noPrefix
  // Composite IDs like "GFSBPOS-204-253" are not guaranteed to be partner store IDs.
  // Returning the first numeric token can mis-map policies to a wrong store (e.g. "204").
  // Only accept explicit "partner store id" patterns, otherwise keep original string path.
  const hadPartnerPrefix = /^partner\s*store\s*id\s*[-:]\s*/i.test(s)
  if (!hadPartnerPrefix) return ''
  const digits = noPrefix.match(/\b(\d{3,6})\b/)
  return digits?.[1] || ''
}

/** 같은 Grab 맵 체인 안에서만 값을 따라 최종 partner/ERP 문자열까지 진행 (정책 매칭용, BFS·다매장 탐색 없음) */
function followGrabStoreMapChainToTerminal(start: string): string {
  const map = parseGrabStoreMap()
  let cur = String(start || '').trim()
  if (!cur) return ''
  const seen = new Set<string>()
  for (let i = 0; i < 10; i++) {
    if (seen.has(cur)) break
    seen.add(cur)
    const next = String(map[cur] || '').trim()
    if (!next || next === cur) break
    cur = next
  }
  return cur
}

function resolveStoreCodeFromGrabMerchant(merchantID: string, partnerMerchantID: string): string {
  const map = parseGrabStoreMap()
  const m1 = String(merchantID || '').trim()
  const m2 = String(partnerMerchantID || '').trim()
  const fromMap = String(map[m1] || map[m2] || '').trim()
  if (fromMap) {
    return followGrabStoreMapChainToTerminal(fromMap) || fromMap
  }
  const fromPartner = extractPartnerStoreDigits(m2)
  if (fromPartner) {
    return followGrabStoreMapChainToTerminal(fromPartner) || fromPartner
  }
  if (m1 && !looksLikeGrabMerchantId(m1)) {
    const d = extractPartnerStoreDigits(m1)
    if (d) return followGrabStoreMapChainToTerminal(d) || d
  }
  const tail = String(m2 || m1 || '').trim()
  return tail ? followGrabStoreMapChainToTerminal(tail) || tail : ''
}

async function resolveStoreCodeFromGrabIntegrationSnapshot(merchantID: string): Promise<string> {
  const id = String(merchantID || '').trim()
  if (!id) return ''
  try {
    const rows = (await supabaseSelectFilter(
      'pos_grab_store_integrations',
      `grab_merchant_id=eq.${encodeURIComponent(id)}`,
      {
        limit: 20,
        order: 'updated_at.desc',
        select: 'partner_merchant_id',
      }
    )) as { partner_merchant_id?: string | null }[] | null
    for (const row of rows || []) {
      const partner = String(row.partner_merchant_id || '').trim()
      if (!partner) continue
      const mapped = followGrabStoreMapChainToTerminal(partner) || partner
      if (mapped) return mapped
    }
  } catch {
    // integration snapshot table may not exist in all environments
  }
  return ''
}

async function resolveStoreCodeForGrabMenu(params: {
  merchantID: string
  partnerMerchantID: string
}): Promise<string> {
  const fromWebhookPair = resolveStoreCodeFromGrabMerchant(params.merchantID, params.partnerMerchantID)
  const normalizedWebhookPair = String(fromWebhookPair || '').trim()
  const looksLikeGrabId =
    looksLikeGrabMerchantId(normalizedWebhookPair) ||
    /^gfsbpos-/i.test(normalizedWebhookPair) ||
    /^partner\s*store\s*id\s*[-:]/i.test(normalizedWebhookPair)
  if (normalizedWebhookPair && !looksLikeGrabId) return normalizedWebhookPair
  const fromIntegration = await resolveStoreCodeFromGrabIntegrationSnapshot(params.merchantID)
  if (fromIntegration) return fromIntegration
  return normalizedWebhookPair
}

/** 배달 정책이 ERP store_code 기준이면, 파트너 숫자·별칭과 맞춰 canonical store_code로 */
async function resolvePolicyStoreCodeForGrabMenu(storeCodeGuess: string): Promise<string> {
  const guess = String(storeCodeGuess || '').trim()
  if (!guess) return ''
  try {
    const masters = await fetchErpStoresMaster()
    if (!masters.length) return guess
    const gk = normStoreKey(guess)
    for (const row of masters) {
      const sc = String(row.store_code || '').trim()
      const keys = [
        sc,
        String(row.display_name || '').trim(),
        ...((row.aliases || []).map((a) => String(a || '').trim())),
      ]
      for (const k of keys) {
        if (normStoreKey(k) === gk) return sc || guess
      }
    }
  } catch {
    // ignore
  }
  return guess
}

async function resolvePolicyBundleForGrabMenu(storeCodeGuess: string): Promise<{
  storeCode: string
  policyBundle: PosDeliveryPolicyBundle | null
}> {
  const seed = String(storeCodeGuess || '').trim()
  if (!seed) return { storeCode: '', policyBundle: null }

  /** ERP에 저장된 배달 정책·메뉴 ON/OFF는 해당 매장의 `store_code`(마스터 기준 정규화) 한 곳만 본다. */
  const storeCode = (await resolvePolicyStoreCodeForGrabMenu(seed)) || seed
  const policyBundle = await getPosDeliveryPolicyBundle({ storeCode, appCode: 'grab' }).catch(() => null)
  return { storeCode, policyBundle }
}

async function loadOptions(): Promise<OptionRow[]> {
  const projections = [
    'id,menu_id,option_code,name,price_modifier,price_modifier_delivery,sort_order,sell_delivery,option_step_values,description_default,description_delivery,description_table',
    'id,menu_id,option_code,name,price_modifier,price_modifier_delivery,sort_order,description_default,description_delivery,description_table',
    'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order,sell_delivery,option_step_values,description_default,description_delivery,description_table',
    'id,menu_id,name,price_modifier,price_modifier_delivery,sort_order,description_default,description_delivery,description_table',
  ]
  for (const c of projections) {
    try {
      const rows = (await supabaseSelectAllPages('pos_menu_options', {
        order: 'menu_id.asc,sort_order.asc,name.asc',
        pageSize: 3000,
        select: c,
      })) as OptionRow[]
      return Array.isArray(rows) ? rows : []
    } catch {
      // try next projection
    }
  }
  return []
}

export async function buildGrabMenuFromPos(params: {
  merchantID: string
  partnerMerchantID: string
}): Promise<unknown> {
  const [loadedMenus, banbanFlavorLinkRows, promoCutByPromoId] = await Promise.all([
    loadMenus(),
    loadBanbanFlavorLinkRows(),
    loadGrabPromoCutPriceByPromoId().catch(() => new Map()),
  ])
  const menus = mergeBanbanFlavorMenuIdsIntoMenus(loadedMenus, banbanFlavorLinkRows)
  if (!menus.length) return grabStubMenuJson(params.merchantID, params.partnerMerchantID)

  const storeGuess = await resolveStoreCodeForGrabMenu({
    merchantID: params.merchantID,
    partnerMerchantID: params.partnerMerchantID,
  })
  const resolved = await resolvePolicyBundleForGrabMenu(storeGuess)
  const { policyBundle } = resolved
  const menuPolicyMap = buildMenuPolicyMap(policyBundle?.menuPolicies || [])
  const categoryOrderMap = buildCategoryOrderMap(policyBundle?.categoryOrders || [])
  const sectionOrderMap = new Map<string, number>()
  for (const [k, order] of categoryOrderMap.entries()) {
    const [main] = String(k || '').split('::')
    const section = normalizeSectionName(main)
    const n = Number(order)
    if (!Number.isFinite(n)) continue
    const prev = sectionOrderMap.get(section)
    if (prev == null || n < prev) sectionOrderMap.set(section, n)
  }

  const options = await loadOptions()
  const linkedMenuIds = new Set<number>()
  const linkedOptions: OptionRow[] = []
  const linkedStepKeysByMenuId = new Map<number, Set<string>>()
  const linkedSelectionConfigByMenuId = new Map<number, OptionSelectionConfigEntry[]>()
  try {
    const [{ groups, itemsByGroupId }, links] = await Promise.all([
      loadPosOptionGroupsWithItems(),
      loadMenuGroupLinks(),
    ])
    const groupsById = new Map<number, PosOptionGroupRow>()
    for (const g of groups || []) {
      const id = Number(g.id || 0)
      if (!id) continue
      groupsById.set(id, g)
    }
    const linksByMenuId = new Map<number, typeof links>()
    for (const link of links || []) {
      const mid = Number(link.menu_id || 0)
      if (!mid) continue
      linkedMenuIds.add(mid)
      if (!linksByMenuId.has(mid)) linksByMenuId.set(mid, [])
      linksByMenuId.get(mid)!.push(link)
    }
    for (const [mid, menuLinks] of linksByMenuId.entries()) {
      const built = buildMenuOptionsFromLinksPerGroup(mid, menuLinks, groupsById, itemsByGroupId)
      const stepKeys = new Set<string>()
      for (const row of built) {
        for (const k of Object.keys(row.optionStepValues || {})) {
          const t = String(k).trim()
          if (t) stepKeys.add(t)
        }
        linkedOptions.push({
          id: Number(String(row.id).replace(/[^\d]/g, '')) || undefined,
          menu_id: Number(row.menuId),
          name: row.name,
          price_modifier: row.priceModifier,
          price_modifier_delivery: row.priceModifierDelivery ?? null,
          sort_order: row.sortOrder,
          sell_delivery: row.sellDelivery !== false,
          option_step_values: row.optionStepValues || null,
        })
      }
      linkedStepKeysByMenuId.set(mid, stepKeys)
      const cfg = buildSelectionConfigFromLinks(menuLinks, groupsById)
      linkedSelectionConfigByMenuId.set(
        mid,
        parseOptionSelectionConfigEntries(cfg.optionSelectionConfig)
      )
    }
  } catch {
    // 신규 테이블 미배포 환경 fallback
  }
  const optionByMenuId = new Map<number, OptionRow[]>()
  for (const opt of options) {
    const menuId = Number(opt.menu_id ?? 0)
    if (!menuId) continue
    if (linkedMenuIds.has(menuId)) {
      const sv =
        opt.option_step_values && typeof opt.option_step_values === 'object' && !Array.isArray(opt.option_step_values)
          ? opt.option_step_values
          : null
      if (!shouldIncludeStandaloneOptionForLinkedMenu(sv, linkedStepKeysByMenuId.get(menuId))) continue
    }
    if (opt.sell_delivery === false) continue
    const list = optionByMenuId.get(menuId) || []
    list.push(opt)
    optionByMenuId.set(menuId, list)
  }
  for (const opt of linkedOptions) {
    const menuId = Number(opt.menu_id ?? 0)
    if (!menuId) continue
    if (opt.sell_delivery === false) continue
    const list = optionByMenuId.get(menuId) || []
    list.push(opt)
    optionByMenuId.set(menuId, list)
  }

  const groups = new Map<string, MenuRow[]>()
  for (const menu of menus) {
    /** 메뉴 `is_active` 꺼짐 또는 `sell_delivery=false` 이면 Grab 메뉴에서 제외. 그다음 `pos_delivery_menu_policies`로 앱별 ON/OFF를 추가 조정한다. */
    if (menu.is_active === false) continue
    // 메뉴 채널 체크박스에서 배달을 끈 메뉴는 Grab 메뉴에서 제외한다.
    if (menu.sell_delivery === false) continue
    const menuId = Number(menu.id ?? 0)
    const policy = menuPolicyMap.get(menuId)
    if (policy && !policy.enabled) continue
    const section = normalizeSectionName(menu.category_main)
    const category = normalizeCategory(menu.category)
    const key = `${section}::${category}`
    const list = groups.get(key) || []
    list.push(menu)
    groups.set(key, list)
  }

  const categoriesBySection = new Map<string, unknown[]>()
  const sectionRanges = new Map<string, TimeRange[]>()

  const sortedCategoryEntries = Array.from(groups.entries()).sort(([groupA], [groupB]) => {
      const [mainA, categoryA] = groupA.split('::')
      const [mainB, categoryB] = groupB.split('::')
      const keyA = `${String(mainA ?? '').trim()}::${String(categoryA ?? '').trim()}`
      const keyB = `${String(mainB ?? '').trim()}::${String(categoryB ?? '').trim()}`
      const orderA = categoryOrderMap.has(keyA) ? Number(categoryOrderMap.get(keyA)) : Number.MAX_SAFE_INTEGER
      const orderB = categoryOrderMap.has(keyB) ? Number(categoryOrderMap.get(keyB)) : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      if (mainA !== mainB) return String(mainA).localeCompare(String(mainB))
      return String(categoryA).localeCompare(String(categoryB))
    })

  for (const [groupKey, categoryMenus] of sortedCategoryEntries) {
    const [sectionNameRaw, categoryNameRaw] = groupKey.split('::')
    const sectionName = normalizeSectionName(sectionNameRaw)
    const categoryName = normalizeCategory(categoryNameRaw)
    const sectionCategoryList = categoriesBySection.get(sectionName) || []
    const categoryId = normalizeId(categoryName, `cat-${sectionCategoryList.length + 1}`)
    const sortedMenus = [...categoryMenus].sort((a, b) => {
      const aid = Number(a.id ?? 0)
      const bid = Number(b.id ?? 0)
      const ap = menuPolicyMap.get(aid)
      const bp = menuPolicyMap.get(bid)
      const ao = Number(ap?.sortOrder ?? a.sort_order ?? 0)
      const bo = Number(bp?.sortOrder ?? b.sort_order ?? 0)
      if (ao !== bo) return ao - bo
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
    const items = sortedMenus.map((menu, itemIndex) => {
      const menuId = Number(menu.id ?? 0)
      const selectionConfigEntries = mergeSelectionConfigEntries(
        linkedSelectionConfigByMenuId.get(menuId) || [],
        parseOptionSelectionConfigEntries(menu.option_selection_config)
      )
      const preferredGroupKeys = selectionConfigEntries.map((cfg) => cfg.key)
      const policy = menuPolicyMap.get(menuId)
      const itemId = buildGrabMenuItemId(menu, itemIndex)
      const menuOptions = (optionByMenuId.get(menuId) || []).sort((a, b) => {
        const ao = Number(a.sort_order ?? 0)
        const bo = Number(b.sort_order ?? 0)
        if (ao !== bo) return ao - bo
        return String(a.name ?? '').localeCompare(String(b.name ?? ''))
      })
      const modifierGroupBuckets = new Map<string, ModifierGroupBucket>()
      for (const opt of menuOptions) {
        const assignments = resolveGrabModifierAssignments(
          opt,
          String(menu.code ?? ''),
          preferredGroupKeys
        )
        const sort = Number(opt.sort_order ?? 0)
        for (const assign of assignments) {
          const key = assign.groupName.toLowerCase()
          if (!modifierGroupBuckets.has(key)) {
            modifierGroupBuckets.set(key, {
              sourceGroupName: assign.groupName,
              firstSort: sort,
              rows: [],
            })
          }
          const bucket = modifierGroupBuckets.get(key)!
          if (sort < bucket.firstSort) bucket.firstSort = sort
          const normalizedOptionName = formatGrabModifierOptionDisplayName(
            assign.groupName,
            assign.optionName
          )
          bucket.rows.push({
            ...opt,
            name: localizeGrabOptionLabel(normalizedOptionName),
          })
        }
      }
      const modifierGroups = Array.from(modifierGroupBuckets.values())
        .sort((a, b) => {
          if (a.firstSort !== b.firstSort) return a.firstSort - b.firstSort
          return a.sourceGroupName.localeCompare(b.sourceGroupName)
        })
        .map((bucket, gidx) => {
          const rows = [...bucket.rows].sort((a, b) => {
            const ao = Number(a.sort_order ?? 0)
            const bo = Number(b.sort_order ?? 0)
            if (ao !== bo) return ao - bo
            return String(a.name ?? '').localeCompare(String(b.name ?? ''))
          })
          const groupName = String(bucket.sourceGroupName || '').trim() || 'Options'
          const forceSingleSelect = shouldForceSingleSelectGroup(groupName, rows)
          const cfgBucket = resolveOptionSelectionConfigForBucket(bucket.sourceGroupName, selectionConfigEntries)
          if (cfgBucket?.audience === 'hall') return null
          const range = grabSelectionRangeForBucket({
            rows,
            groupName,
            configEntry: cfgBucket,
            forceSingleSelectLegacy: forceSingleSelect,
          })
          return {
            id: gidx === 0 ? `${itemId}-mods` : `${itemId}-mods-${gidx + 1}`,
            name: range.groupDisplayName,
            sequence: gidx + 1,
            availableStatus: 'AVAILABLE' as const,
            selectionRangeMin: range.min,
            selectionRangeMax: range.max,
            modifiers: rows.map((opt, idx) => {
              const optionCode = String(opt.option_code ?? '').trim()
              const optId = String(opt.id ?? '').trim()
              const modId = normalizeId(
                `mod-${optionCode || optId}-${itemId}-${idx + 1}`,
                `${itemId}-mod-${idx + 1}`
              )
              const modPrice =
                opt.price_modifier_delivery != null ? opt.price_modifier_delivery : opt.price_modifier
              const modDescDelivery = String(opt.description_delivery ?? '').trim()
              const modDescDefault = String(opt.description_default ?? '').trim()
              const modDesc = sanitizeGrabMenuDescription(modDescDelivery || modDescDefault)
              return {
                id: modId,
                name: String(opt.name ?? `Option ${idx + 1}`),
                description: modDesc || undefined,
                sequence: idx + 1,
                availableStatus: 'AVAILABLE' as const,
                price: toMinorUnit(modPrice ?? 0),
              }
            }),
          }
        })
        .filter((group): group is NonNullable<typeof group> => group != null)

      const banbanFlavorMenus = isBanbanMenuRow(menu)
        ? getBanbanFlavorMenuList(
            menus.map(toBanbanPosMenu),
            toBanbanPosMenu(menu),
            new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
          )
            .map((candidate) => {
              const id = Number(candidate.id || 0)
              return menus.find((m) => Number(m.id ?? 0) === id)
            })
            .filter((m): m is MenuRow => !!m)
            .filter((m) => isGrabBanbanFlavorAvailable(m, menuPolicyMap.get(Number(m.id ?? 0))))
            .slice(0, 30)
        : []
      const banbanModifierGroups =
        banbanFlavorMenus.length > 0
          ? [1, 2].map((slot) => ({
              id: `${itemId}-banban-${slot}`,
              name: slot === 1 ? 'Flavor 1' : 'Flavor 2',
              sequence: modifierGroups.length + slot,
              availableStatus: 'AVAILABLE' as const,
              selectionRangeMin: 1,
              selectionRangeMax: 1,
              modifiers: banbanFlavorMenus.map((flavor, idx) => {
                const fid = Number(flavor.id ?? 0)
                const fcode = String(flavor.code ?? '').trim()
                const baseId = fid > 0 ? `f-${fid}` : normalizeId(fcode, `f-${idx + 1}`)
                return {
                  id: `${itemId}-banban-${slot}-${baseId}`,
                  name: String(flavor.name ?? `Flavor ${idx + 1}`),
                  sequence: idx + 1,
                  availableStatus: 'AVAILABLE' as const,
                  price: 0,
                }
              }),
            }))
          : []

      const soldOut = isSoldOutDate(menu.sold_out_date)
      const active = menu.is_active !== false
      const available = active && !soldOut && isMenuAvailableByDeliveryPolicy(policy)
      const deliveryPrice = menu.price_delivery != null ? menu.price_delivery : menu.price
      const promoId = Number(menu.promo_id ?? 0)
      const promoCut = promoId > 0 ? promoCutByPromoId.get(promoId) : undefined
      /**
       * Grab Cut Price: item.price=정가(minor), advancedPricing=Grab 앱 배달 할인가.
       * 손님 앱 취소선은 percentage 캠페인 + 정가 item.price 조합. fixPrice만 있으면 111만 보일 수 있음.
       */
      const grabListPriceMajor =
        promoCut?.showCutPrice ? promoCut.regularPrice : Number(deliveryPrice ?? 0)
      const grabListPriceMinor = Math.max(1, toMinorUnit(grabListPriceMajor))
      const grabSalePriceMinor =
        promoCut?.showCutPrice ? Math.max(1, toMinorUnit(promoCut.salePrice)) : grabListPriceMinor
      /**
       * percentage 캠페인은 정가(item.price) 기준 % 할인으로 취소선(정가→할인가)을 만든다.
       * 이때 advancedPricing(배달가 덮어쓰기=할인가)을 함께 보내면 배달가가 할인가로 고정되어
       * 캠페인 할인 결과와 같아져 상쇄된다 → 취소선·정상가 사라지고 할인가만 노출.
       * 따라서 percentage 전략에서는 advancedPricing을 생략하고 캠페인이 단독으로 할인을 만든다.
       * (fixPrice 전략일 때만 advancedPricing으로 배달 할인가를 직접 내린다.)
       */
      const includeAdvancedPricing =
        promoCut?.showCutPrice &&
        resolveGrabPromoCampaignDiscountType() !== 'percentage' &&
        (isGrabAdvancedPricingFallbackEnabled() || !isGrabAdvancedPricingExplicitlyDisabled())
      const policyImageUrl = String(policy?.imageUrl ?? '').trim()
      const photoUrl = isValidPhotoUrl(policyImageUrl)
        ? policyImageUrl
        : isValidPhotoUrl(menu.image)
          ? menu.image
          : ''
      const menuDescDelivery = String(menu.description_delivery ?? '').trim()
      const menuDescDefault = String(menu.description_default ?? '').trim()
      const menuDesc = sanitizeGrabMenuDescription(menuDescDelivery || menuDescDefault)
      return {
        id: itemId,
        name: String(menu.name ?? menu.code ?? 'Menu'),
        nameTranslation: {},
        sequence: itemIndex + 1,
        availableStatus: available ? 'AVAILABLE' : 'UNAVAILABLE',
        ...(available ? {} : { maxStock: 0 }),
        price: grabListPriceMinor,
        ...(includeAdvancedPricing
          ? { advancedPricing: buildGrabDeliveryAdvancedPricing(grabSalePriceMinor) }
          : {}),
        campaignInfo: null,
        description: menuDesc,
        photos: photoUrl ? [photoUrl] : [],
        modifierGroups: [...modifierGroups, ...banbanModifierGroups],
      }
    })

    const sectionRangesCurrent = sectionRanges.get(sectionName) || []
    for (const m of sortedMenus) {
      const pid = Number(m.id ?? 0)
      const policy = menuPolicyMap.get(pid)
      const start = parseHHmm(policy?.sellStartTime)
      const end = parseHHmm(policy?.sellEndTime)
      if (start && end) sectionRangesCurrent.push({ start, end })
    }
    if (sectionRangesCurrent.length > 0) sectionRanges.set(sectionName, sectionRangesCurrent)

    sectionCategoryList.push({
      id: categoryId,
      name: categoryName,
      nameTranslation: {} as Record<string, string>,
      sequence: sectionCategoryList.length + 1,
      availableStatus: 'AVAILABLE' as const,
      items,
    })
    categoriesBySection.set(sectionName, sectionCategoryList)
  }

  let sections = Array.from(categoriesBySection.entries())
    .map(([sectionName, categories]) => ({
      sectionName,
      categories: (categories || []).filter(
        (cat) => Array.isArray((cat as { items?: unknown[] }).items) && (cat as { items?: unknown[] }).items!.length > 0
      ),
      serviceHours: serviceHoursFromRanges(sectionRanges.get(sectionName) || []),
    }))
    .filter((s) => s.categories.length > 0)
    .sort((a, b) => {
      const ao = sectionOrderMap.get(a.sectionName)
      const bo = sectionOrderMap.get(b.sectionName)
      if (ao != null || bo != null) {
        const ra = ao ?? Number.MAX_SAFE_INTEGER
        const rb = bo ?? Number.MAX_SAFE_INTEGER
        if (ra !== rb) return ra - rb
      }
      const ka = sectionSortKey(a.sectionName)
      const kb = sectionSortKey(b.sectionName)
      if (ka !== kb) return ka - kb
      return a.sectionName.localeCompare(b.sectionName)
    })
    .map((section, idx) => ({
      id: `SECTION-${String(idx + 1).padStart(2, '0')}`,
      name: section.sectionName,
      sequence: idx + 1,
      serviceHours: section.serviceHours,
      categories: section.categories,
    }))

  // 기본은 섹션 분리(Breakfast/Regular 등)를 유지한다.
  // 특정 온보딩/검증에서 필요할 때만 단일 섹션 강제 평탄화.
  if (process.env.GRAB_FORCE_SINGLE_SECTION === '1') {
    sections = flattenSectionsToSingle(sections)
  }

  if (!sections.length) return grabStubMenuJson(params.merchantID, params.partnerMerchantID)

  const { sellingTimes, categories } = buildSellingTimesAndRootCategories(sections)

  /** `sections`는 시뮬레이터·구버전 호환, 루트 `sellingTimes`·`categories`는 Grab 검증(GetMenuNew) 필수 */
  return {
    merchantID: params.merchantID,
    partnerMerchantID: params.partnerMerchantID,
    currency: { code: 'THB', symbol: '฿', exponent: 2 },
    sellingTimes,
    categories,
    sections,
  }
}
