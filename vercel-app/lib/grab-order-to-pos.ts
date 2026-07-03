import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  supabaseInsertWithPgrst204Fallback,
  supabaseUpdateByFilterWithPgrst204Fallback,
} from '@/lib/supabase-pgrst204-retry'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { consumeDeliveryMenuStockByName } from '@/lib/pos-delivery-policy'
import {
  buildGrabOrderMemo,
  grabOrderMemoPostgrestIlikeFilter,
  mergeGrabStateIntoFullMemo,
} from '@/lib/grab-order-memo'
import { resolveCanonicalErpStoreCode } from '@/lib/erp-store-identity'
import { resolvePlatformDiscountReasonForSave } from '@/lib/pos-platform-discount-reason'
import { parseGrabStoreMap, resolveErpStoreCodeFromGrabMap } from '@/lib/grab-store-map-env'
import { normStoreKey } from '@/lib/store-list-keys'
import {
  buildGrabPosCatalog,
  deepReadGrabLineMinorTotal,
  parseGrabPartnerItemMenuRef,
  resolveGrabItemNameAndMeta,
  resolveGrabLineUnitMinor,
  resolveGrabMerchantPosTotal,
  resolveOptionCodesToLabels,
  enrichGrabPromoItemsWithDefaultSizeFromCatalog,
  grabSelectionIncludesExplicitSize,
  resolveGrabEcoCutleryNoteTokenFromOrder,
  ensureGrabSidedishModifiersPreservedInNote,
  grabPromoSnapshotIncludesModifierLabel,
  type GrabPosCatalog,
} from '@/lib/grab-pos-order-enrich'
import {
  loadGrabPromoChoiceCatalogByPromoId,
  promoCatalogHasChoiceGroups,
  resolvePromoItemsForGrabOrder,
  type GrabPromoChoiceCatalogRow,
} from '@/lib/grab-promo-choice-modifier-groups'
import {
  mergeGrabSetChildLinesIntoPromoParents,
  parseGrabSetChildLineName,
  type GrabSetPosLine,
} from '@/lib/grab-set-pos-lines'
import { normalizePromoLookupText } from '@/lib/pos-payment-receipt-from-order'
import {
  extractGrabBanbanFlavorSlotsFromModifiers,
  isBanbanMenu,
  resolveGrabBanbanPosIngestSnapshot,
} from '@/lib/pos-banban-utils'

type GrabOrderPersistResult =
  | {
      ok: true
      orderId: number
      orderNo: string
      duplicate: boolean
      storeCode: string
    }
  | {
      ok: false
      message: string
    }

type GrabOrderStateSyncResult =
  | {
      ok: true
      updated: boolean
      memoUpdated?: boolean
      orderId?: number
      status?: string
      grabState?: string
    }
  | {
      ok: false
      message: string
    }

type PosItem = {
  id: string
  name: string
  price: number
  qty: number
  menuId1?: string
  optionCode?: string | null
  optionCode1?: string
  optionCodes?: string[]
  note?: string
  deliveryAppCode?: string
  promoId?: string
  promoCode?: string
  promoItems?: {
    menuId: string
    optionId: string | null
    optionCode?: string | null
    quantity: number
  }[]
}

export type GrabPosOrderSnapshot = {
  items: PosItem[]
  subtotal: number
  discountAmt: number
  deliveryFee: number
  packagingFee: number
  vat: number
  total: number
  paymentCash: number
  paymentDeliveryApp: number
  tableName: string
  orderType: 'delivery' | 'dine_in'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toNumber(value: unknown): number {
  if (typeof value === 'string') return Number(value) || 0
  return Number(value) || 0
}

function currencyExponent(order: Record<string, unknown>): number {
  const currency = asRecord(order.currency)
  const exp = Math.trunc(toNumber(currency.exponent))
  if (exp >= 0 && exp <= 4) return exp
  return 2
}

function minorToMajor(value: unknown, exponent: number): number {
  const n = toNumber(value)
  if (!Number.isFinite(n)) return 0
  const hasDecimal = Math.abs(n % 1) > 1e-9
  if (hasDecimal || exponent <= 0) return Math.round(n * 100) / 100
  const major = n / 10 ** exponent
  return Math.round(major * 100) / 100
}

function readFirstFinite(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return 0
}

function isMachineLikeGrabToken(raw: string): boolean {
  const s = String(raw || '').trim()
  if (!s) return true
  // Grab 내부 식별자 형태(mod-284-item-74-o23-2, item-123-option-9 등)는 노출하지 않음
  if (/^(mods?:)?[a-z]+-\d+(?:-[a-z0-9]+)*$/i.test(s)) return true
  // 사람이 읽기 어려운 id/slug 조합도 메모에서 제외
  if (/^[a-z0-9_-]{16,}$/i.test(s) && !/\s/.test(s)) return true
  return false
}

function pickCustomerReadableText(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? '').trim()
    if (!s) continue
    if (isMachineLikeGrabToken(s)) continue
    return s
  }
  return ''
}

function extractReadableModifierNames(mod: Record<string, unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: mod, depth: 0 }]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { value, depth } = node
    if (depth > 2 || value == null) continue
    if (typeof value !== 'object') continue
    const rec = asRecord(value)
    for (const [kRaw, v] of Object.entries(rec)) {
      const k = String(kRaw || '').trim().toLowerCase()
      if (v && typeof v === 'object') {
        queue.push({ value: v, depth: depth + 1 })
        continue
      }
      const isNameLike =
        k === 'name' ||
        k === 'title' ||
        k === 'label' ||
        k.includes('optionname') ||
        k.includes('selectionname') ||
        k.includes('modifiername') ||
        k.includes('displayname')
      if (!isNameLike) continue
      const text = pickCustomerReadableText(v)
      if (!text) continue
      const nk = text.toLowerCase()
      if (seen.has(nk)) continue
      seen.add(nk)
      out.push(text)
    }
  }
  return out
}

function extractModifierCandidatesFromItem(item: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const visited = new Set<unknown>()
  const queue: Array<{ key: string; value: unknown; depth: number }> = [{ key: '', value: item, depth: 0 }]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { key, value, depth } = node
    if (depth > 5 || value == null) continue
    if (typeof value !== 'object') continue
    if (visited.has(value)) continue
    visited.add(value)
    const isKeyLikelyModifier =
      key.includes('modifier') || key.includes('option') || key.includes('selection') || key.includes('addon')
    if (isKeyLikelyModifier && !Array.isArray(value)) out.push(asRecord(value))
    if (Array.isArray(value)) {
      for (const x of value) queue.push({ key, value: x, depth: depth + 1 })
      continue
    }
    const rec = asRecord(value)
    for (const [kRaw, v] of Object.entries(rec)) {
      const k = String(kRaw || '').trim().toLowerCase()
      if (!k) continue
      if (v && typeof v === 'object') queue.push({ key: k, value: v, depth: depth + 1 })
    }
  }
  return out
}

function extractReadableOptionsFromItemText(item: Record<string, unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const fields = [item.name, item.title, item.displayName, item.itemName, item.grabItemName]
  for (const raw of fields) {
    const text = String(raw ?? '').trim()
    if (!text) continue
    // 예: "SOY ... + M · 순살" → ["M", "순살"]
    const plusParts = text.split('+').slice(1)
    for (const p of plusParts) {
      const pieces = p
        .split(/[·•|,/]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const hasNonNumericPiece = pieces.some((x) => !/^\d+$/.test(x))
      for (const piece of pieces) {
        if (hasNonNumericPiece && /^\d+$/.test(piece)) continue
        if (isMachineLikeGrabToken(piece)) continue
        const nk = piece.toLowerCase()
        if (seen.has(nk)) continue
        seen.add(nk)
        out.push(piece)
      }
    }
  }
  return out
}

function buildModifierPriceSignature(mod: Record<string, unknown>): string {
  const id = String(mod.id ?? mod.modifierID ?? mod.modifierId ?? mod.optionID ?? mod.optionId ?? '').trim()
  const name = String(mod.name ?? mod.title ?? mod.label ?? '').trim().toLowerCase()
  const price = Number(mod.price ?? mod.amount ?? mod.totalPrice ?? 0) || 0
  const qty = Math.max(1, Math.trunc(Number(mod.quantity ?? mod.qty ?? 1) || 1))
  return `${id}|${name}|${price}|${qty}`
}

function buildModifierFuzzySignature(mod: Record<string, unknown>): string {
  const name = String(mod.name ?? mod.title ?? mod.label ?? '').trim().toLowerCase()
  const price = Number(mod.price ?? mod.amount ?? mod.totalPrice ?? 0) || 0
  const qty = Math.max(1, Math.trunc(Number(mod.quantity ?? mod.qty ?? 1) || 1))
  return `${name}|${price}|${qty}`
}

function isLikelyOptionCode(raw: string): boolean {
  const s = String(raw || '').trim()
  if (!s) return false
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(s)
}

function extractOptionCodesFromModifier(mod: Record<string, unknown>): string[] {
  const out = new Set<string>()
  const idCandidates = [
    mod.id,
    mod.modifierID,
    mod.modifierId,
    mod.optionID,
    mod.optionId,
    mod.code,
    mod.optionCode,
  ]
  for (const raw of idCandidates) {
    const text = String(raw ?? '').trim()
    if (!text) continue
    const fromModId =
      /(?:^|[^A-Za-z0-9])mod-([A-Za-z][A-Za-z0-9]*-\d+)-item-/i.exec(text)?.[1] ||
      /^mod-([A-Za-z][A-Za-z0-9]*-\d+)-item-/i.exec(text)?.[1]
    if (fromModId && isLikelyOptionCode(fromModId)) out.add(fromModId.toUpperCase())
    if (isLikelyOptionCode(text)) out.add(text.toUpperCase())
  }
  return Array.from(out)
}

/** Grab submit_order: `modifiers[]` + `modifierGroups[].modifiers[]` (API는 name 없이 id만 올 수 있음) */
function flattenGrabOrderItemModifiers(item: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const push = (raw: unknown) => {
    const mod = asRecord(raw)
    if (!Object.keys(mod).length) return
    const sig = buildModifierPriceSignature(mod)
    if (seen.has(sig)) return
    seen.add(sig)
    out.push(mod)
  }
  for (const m of Array.isArray(item.modifiers) ? item.modifiers : []) push(m)
  for (const g of Array.isArray(item.modifierGroups) ? item.modifierGroups : []) {
    const group = asRecord(g)
    for (const m of Array.isArray(group.modifiers) ? group.modifiers : []) push(m)
    for (const m of Array.isArray(group.selectedModifiers) ? group.selectedModifiers : []) push(m)
  }
  return out
}

function grabPosItemHasOptionSnapshot(item: PosItem): boolean {
  const note = String(item.note ?? '').trim()
  if (/(?:^|\s)(mods?:|optc:)/i.test(note)) return true
  if (/(?:^|[\s·,])[A-Za-z][A-Za-z0-9]*-\d+/.test(note)) return true
  if (String(item.optionCode ?? item.optionCode1 ?? '').trim()) return true
  if (Array.isArray(item.optionCodes) && item.optionCodes.length > 0) return true
  return false
}

function countGrabPosItemOptionSnapshots(items: PosItem[]): number {
  return items.filter((it) => grabPosItemHasOptionSnapshot(it)).length
}

/** 주방 슬립: `SPICY YANGNYEOM (M - Drumette)` 형태 — note 유실 시에도 옵션 표기 */
function formatGrabKitchenDisplayName(baseName: string, modifierLabels: string[]): string {
  const name = String(baseName ?? '').trim()
  const labels = (modifierLabels || []).map((x) => String(x ?? '').trim()).filter(Boolean)
  if (!name || labels.length === 0) return name
  if (/\([^)]+\)/.test(name)) return name
  const nameKey = name.toLowerCase()
  const extras = labels.filter((lab) => {
    const lk = lab.toLowerCase()
    if (lk === nameKey) return false
    if (nameKey.includes(lk) || lk.includes(nameKey)) return false
    return true
  })
  if (extras.length === 0) return name
  const sizePart = extras.filter((lab) =>
    /^(?:size\s*)?(?:xxl|xl|l|m|s)\b/i.test(lab) ||
    /\b(size|part|boneless|drumette|joint wing|wing|leg|순살|뼈|โดบา|ปีก)\b/i.test(lab)
  )
  const sideOrOther = extras.filter((lab) => !sizePart.includes(lab))
  const grouped = [...sizePart, ...sideOrOther]
  if (grouped.length === 0) return name
  if (grouped.length === 1) return `${name} (${grouped[0]})`
  const head = grouped[0]
  const tail = grouped.slice(1).join(', ')
  if (/^(?:size\s*)?(?:xxl|xl|l|m|s)\b/i.test(head) && tail) return `${name} (${head} - ${tail})`
  return `${name} (${grouped.join(', ')})`
}

function readLineMinorTotal(item: Record<string, unknown>): number {
  const lineTotalMinor = readFirstFinite(
    item.subtotal,
    item.totalPrice,
    item.total,
    item.finalPrice,
    item.amount,
    item.lineAmount
  )
  return lineTotalMinor > 0 ? lineTotalMinor : 0
}

function normalizeStoreCodeCandidate(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const noPrefix = s.replace(/^partner\s*store\s*id\s*[-:]\s*/i, '').trim()
  if (!noPrefix) return ''
  // "CM 1048" 같이 접두가 붙은 경우 숫자 코드 우선
  const m = noPrefix.match(/\b(\d{3,6})\b/)
  if (m?.[1]) return m[1]
  return noPrefix
}

function extractStoreCodeFromOrderPayload(order: Record<string, unknown>): string {
  const fields = [
    order.partnerMerchantID,
    order.partnerStoreID,
    order.partnerStoreId,
    order.storeCode,
    order.store_code,
    order.storeID,
    order.storeId,
    order.storeName,
    order.partnerStoreName,
  ]
  for (const f of fields) {
    const norm = normalizeStoreCodeCandidate(String(f ?? ''))
    if (norm) return norm
  }
  return ''
}

export function resolveGrabStoreCode(order: Record<string, unknown>): string {
  const partnerMerchantID = String(order.partnerMerchantID ?? '').trim()
  const merchantID = String(order.merchantID ?? '').trim()
  const map = parseGrabStoreMap()
  const payloadDerived = extractStoreCodeFromOrderPayload(order)
  const mapped =
    lookupGrabStoreMapSeed(map, partnerMerchantID) || lookupGrabStoreMapSeed(map, merchantID) || ''
  const raw =
    normalizeStoreCodeCandidate(mapped) ||
    payloadDerived ||
    normalizeStoreCodeCandidate(partnerMerchantID) ||
    normalizeStoreCodeCandidate(merchantID) ||
    partnerMerchantID ||
    merchantID
  return resolveErpStoreCodeFromGrabMap(raw) || raw
}

function lookupGrabStoreMapSeed(map: Record<string, string>, key: string): string {
  const trimmed = String(key || '').trim()
  if (!trimmed) return ''
  const direct = String(map[trimmed] ?? '').trim()
  if (direct) return direct
  const nk = normStoreKey(trimmed)
  if (!nk) return ''
  for (const [k, v] of Object.entries(map)) {
    if (normStoreKey(k) === nk) return String(v || '').trim()
  }
  return ''
}

async function loadPosMenuNameById(): Promise<Map<number, string>> {
  try {
    const rows = (await supabaseSelectFilter('pos_menus', 'id=gt.0', {
      limit: 20000,
      select: 'id,name',
      order: 'id.asc',
    })) as { id?: number; name?: string }[] | null
    const out = new Map<number, string>()
    for (const row of rows || []) {
      const id = Number(row.id ?? 0)
      const name = String(row.name ?? '').trim()
      if (id > 0 && name) out.set(id, name)
    }
    return out
  } catch {
    return new Map<number, string>()
  }
}

async function loadGrabPosCatalog(): Promise<GrabPosCatalog> {
  try {
    const { loadPosOptionRowsForCodeMap } = await import('@/lib/pos-menu-options-code-catalog-server')
    const [menus, optionCatalogRows, promos, promoChoiceCatalog] = await Promise.all([
      supabaseSelectFilter('pos_menus', 'id=gt.0', {
        limit: 20000,
        select: 'id,name,code',
        order: 'id.asc',
      }) as Promise<{ id?: number; name?: string; code?: string }[] | null>,
      loadPosOptionRowsForCodeMap(),
      supabaseSelect('pos_promos', {
        limit: 5000,
        select: 'id,name,code',
        order: 'id.asc',
      }) as Promise<{ id?: string | number; name?: string; code?: string }[] | null>,
      loadGrabPromoChoiceCatalogByPromoId().catch(() => ({
        byPromoId: new Map<number, GrabPromoChoiceCatalogRow[]>(),
        menuPromoIdByMenuId: new Map<number, string>(),
      })),
    ])
    const promosWithItems = (promos || []).map((p) => {
      const id = String(p.id ?? '').trim()
      const promoIdNum = Number(id)
      const items =
        promoIdNum > 0 ? promoChoiceCatalog.byPromoId.get(promoIdNum) || [] : []
      return {
        id,
        name: String(p.name ?? '').trim(),
        code: String(p.code ?? '').trim(),
        items: items.map((it) => ({
          menuId: String(it.menuId ?? '').trim(),
          optionId: it.optionId != null && String(it.optionId).trim() ? String(it.optionId).trim() : null,
          ...(it.optionCode ? { optionCode: String(it.optionCode).trim() } : {}),
          quantity: Math.max(1, Number(it.quantity) || 1),
          ...(it.menuName ? { menuName: String(it.menuName).trim() } : {}),
          ...(it.optionName ? { optionName: String(it.optionName).trim() } : {}),
          ...(it.choiceGroup ? { choiceGroup: String(it.choiceGroup).trim() } : {}),
          ...(it.choicePickCount != null ? { choicePickCount: it.choicePickCount } : {}),
        })),
      }
    })
    return buildGrabPosCatalog(
      menus || [],
      optionCatalogRows.map((o) => ({
        name: o.name,
        optionCode: o.optionCode,
      })),
      promosWithItems,
      promoChoiceCatalog.menuPromoIdByMenuId
    )
  } catch {
    return buildGrabPosCatalog([], [], [], new Map())
  }
}

function extractReadableNamesFromMachineIds(
  item: Record<string, unknown>,
  menuNameById: Map<number, string>
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const visited = new Set<unknown>()
  const queue: Array<{ key: string; value: unknown; depth: number }> = [{ key: '', value: item, depth: 0 }]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { key, value, depth } = node
    if (depth > 4 || value == null) continue
    if (typeof value === 'object') {
      if (visited.has(value)) continue
      visited.add(value)
      if (Array.isArray(value)) {
        for (const x of value) queue.push({ key, value: x, depth: depth + 1 })
        continue
      }
      const rec = asRecord(value)
      for (const [kRaw, v] of Object.entries(rec)) {
        const k = String(kRaw || '').trim().toLowerCase()
        queue.push({ key: k, value: v, depth: depth + 1 })
      }
      continue
    }
    const keyLikeId =
      key.includes('id') || key.includes('modifier') || key.includes('option') || key.includes('selection')
    if (!keyLikeId) continue
    const raw = String(value ?? '').trim()
    if (!raw) continue
    const matches = raw.match(/(?:^|[-_])f[-_](\d+)(?:$|[-_])/gi) || []
    for (const token of matches) {
      const m = /f[-_](\d+)/i.exec(token)
      const id = Number(m?.[1] ?? 0)
      if (!id) continue
      const nm = String(menuNameById.get(id) || '').trim()
      if (!nm) continue
      const nk = nm.toLowerCase()
      if (seen.has(nk)) continue
      seen.add(nk)
      out.push(nm)
    }
  }
  return out
}

function extractBanbanSlotNumbersFromItem(item: Record<string, unknown>): string[] {
  const found = new Set<number>()
  const visited = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: item, depth: 0 }]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { value, depth } = node
    if (depth > 4 || value == null) continue
    if (typeof value === 'object') {
      if (visited.has(value)) continue
      visited.add(value)
      if (Array.isArray(value)) {
        for (const x of value) queue.push({ value: x, depth: depth + 1 })
        continue
      }
      for (const v of Object.values(asRecord(value))) {
        queue.push({ value: v, depth: depth + 1 })
      }
      continue
    }
    const raw = String(value ?? '').trim()
    if (!raw) continue
    const matches = raw.match(/banban[-_](\d+)/gi) || []
    for (const token of matches) {
      const m = /banban[-_](\d+)/i.exec(token)
      const n = Number(m?.[1] ?? 0)
      if (n > 0 && n <= 9) found.add(n)
    }
  }
  return Array.from(found)
    .sort((a, b) => a - b)
    .map((n) => String(n))
}

function getCodeLabelCaseInsensitive(optionNameByCode: Map<string, string>, code: string): string {
  const key = String(code || '').trim().toUpperCase()
  if (!key) return ''
  const exact = optionNameByCode.get(key)
  if (exact) return String(exact).trim()
  const lower = optionNameByCode.get(key.toLowerCase())
  if (lower) return String(lower).trim()
  for (const [k, v] of optionNameByCode.entries()) {
    if (String(k || '').trim().toUpperCase() === key) return String(v || '').trim()
  }
  return ''
}

function resolveSizeLetterOptionLabel(
  menuCode: string,
  letter: string,
  optionNameByCode: Map<string, string>
): string {
  const mc = String(menuCode || '').trim().toUpperCase()
  const L = String(letter || '').trim().toUpperCase()
  if (!mc || !/^[SML]$/.test(L)) return ''
  for (const [code, label] of optionNameByCode.entries()) {
    const c = String(code || '').trim().toUpperCase()
    if (!c.startsWith(`${mc}-`)) continue
    const lab = String(label || '').trim()
    if (!lab) continue
    if (new RegExp(`(^|[\\s\\-–—])${L}([\\s\\-–—]|$)`, 'i').test(lab)) return lab
    if (new RegExp(`^size\\s+${L}\\b`, 'i').test(lab)) return lab
  }
  return ''
}

function hasSizeProfileForMenu(menuCode: string, optionNameByCode: Map<string, string>): boolean {
  const mc = String(menuCode || '').trim().toUpperCase()
  if (!mc) return false
  let seenMOrL = false
  for (const [code, label] of optionNameByCode.entries()) {
    const c = String(code || '').trim().toUpperCase()
    if (!c.startsWith(`${mc}-`)) continue
    const lab = String(label || '').trim()
    if (!lab) continue
    if (/(^|[\s\-–—])M([\s\-–—]|$)/i.test(lab) || /(^|[\s\-–—])L([\s\-–—]|$)/i.test(lab)) {
      seenMOrL = true
      break
    }
    if (/\bsize\s*(m|l)\b/i.test(lab)) {
      seenMOrL = true
      break
    }
  }
  return seenMOrL
}

function inferDefaultSizeLabelForGrabLine(
  menuCode: string,
  currentLabels: string[],
  optionCodes: string[],
  optionNameByCode: Map<string, string>
): string {
  if (
    grabSelectionIncludesExplicitSize({
      labels: currentLabels,
      optionCodes,
      optionNameByCode,
    })
  ) {
    return ''
  }
  const mc = String(menuCode || '').trim()
  if (!mc) return ''
  if (!hasSizeProfileForMenu(mc, optionNameByCode)) return ''
  return resolveSizeLetterOptionLabel(mc, 'S', optionNameByCode) || 'Size S'
}

function normalizeModifierNamesForDisplay(params: {
  names: string[]
  menuCode: string
  optionNameByCode: Map<string, string>
}): string[] {
  const menuCode = String(params.menuCode || '').trim().toUpperCase()
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const s = String(raw || '').trim()
    if (!s) return
    const nk = s.toLowerCase()
    if (seen.has(nk)) return
    seen.add(nk)
    out.push(s)
  }

  for (const raw of params.names || []) {
    const token = String(raw || '').trim()
    if (!token) continue
    if (/^\d+$/.test(token)) {
      if (menuCode) {
        const label = getCodeLabelCaseInsensitive(
          params.optionNameByCode,
          `${menuCode}-${token}`
        )
        if (label) {
          push(label)
          continue
        }
      }
      continue
    }
    const sizeOnly = /^size\s+([sml])\b/i.exec(token)
    if (sizeOnly && menuCode) {
      const label = resolveSizeLetterOptionLabel(menuCode, sizeOnly[1], params.optionNameByCode)
      if (label) {
        push(label)
        continue
      }
    }
    if (/^[SML]$/i.test(token) && menuCode) {
      const label = resolveSizeLetterOptionLabel(menuCode, token, params.optionNameByCode)
      if (label) {
        push(label)
        continue
      }
    }
    push(token)
  }
  return out
}

function resolveMenuCodeForGrabLine(params: {
  resolvedMenuId?: string
  menuRef: ReturnType<typeof parseGrabPartnerItemMenuRef>
  itemName: string
  catalog: Awaited<ReturnType<typeof loadGrabPosCatalog>>
}): string {
  const byResolvedId = Number(params.resolvedMenuId || 0)
  if (byResolvedId > 0) {
    const hit = params.catalog.menuById.get(byResolvedId)
    const code = String(hit?.code ?? '').trim()
    if (code) return code
  }
  const refCode = String(params.menuRef?.code ?? '').trim()
  if (refCode) return refCode
  const bracket = parseGrabSetChildLineName(params.itemName)
  if (bracket) {
    const key = bracket.childName.toLowerCase()
    for (const menu of params.catalog.menuById.values()) {
      if (String(menu.name || '').trim().toLowerCase() === key) {
        return String(menu.code || '').trim()
      }
    }
  }
  const itemNameKey = String(params.itemName || '').trim().toLowerCase()
  if (itemNameKey) {
    for (const menu of params.catalog.menuById.values()) {
      if (String(menu.name || '').trim().toLowerCase() === itemNameKey) {
        const code = String(menu.code || '').trim()
        if (code) return code
      }
    }
  }
  const fromName = String(params.itemName || '').trim().match(/\b([A-Za-z]\d{2,})\b/)?.[1]
  return String(fromName || '').trim()
}

function mergeSetChildModifiersFromParent(
  item: Record<string, unknown>,
  flatModifiers: Record<string, unknown>[],
  allRawItems: unknown[]
): Record<string, unknown>[] {
  const itemName = String(item.name ?? item.title ?? '').trim()
  const childParsed = parseGrabSetChildLineName(itemName)
  if (!childParsed) return flatModifiers

  const slotProbe = extractGrabBanbanFlavorSlotsFromModifiers(flatModifiers, null)
  const hasBanbanSlots = slotProbe.flavorMenuIds.length >= 2
  const hasOptionCodes = flatModifiers.some((m) => extractOptionCodesFromModifier(asRecord(m)).length > 0)
  const hasReadableMods = flatModifiers.some((m) => extractReadableModifierNames(asRecord(m)).length > 0)
  if (hasBanbanSlots && (hasOptionCodes || hasReadableMods)) return flatModifiers

  const labelKey = normalizePromoLookupText(childParsed.promoLabel)
  if (!labelKey) return flatModifiers

  for (const raw of allRawItems) {
    const parent = asRecord(raw)
    const parentName = String(parent.name ?? parent.title ?? '').trim()
    if (!parentName || parseGrabSetChildLineName(parentName)) continue
    const parentKey = normalizePromoLookupText(
      parentName.replace(/^\[+/, '').replace(/\]+$/, '').replace(/\]\s*\[/g, ' ')
    )
    if (parentKey !== labelKey && !parentKey.includes(labelKey) && !labelKey.includes(parentKey)) {
      continue
    }
    const parentMods = flattenGrabOrderItemModifiers(parent)
    if (parentMods.length === 0) continue
    const merged = [...flatModifiers]
    const seen = new Set(flatModifiers.map((m) => buildModifierPriceSignature(asRecord(m))))
    for (const mod of parentMods) {
      const sig = buildModifierPriceSignature(asRecord(mod))
      if (seen.has(sig)) continue
      seen.add(sig)
      merged.push(mod)
    }
    return merged
  }
  return flatModifiers
}

async function buildPosItems(order: Record<string, unknown>): Promise<PosItem[]> {
  const exponent = currencyExponent(order)
  const rawItems = Array.isArray(order.items) ? order.items : []
  const ecoSummary = resolveGrabEcoCutleryNoteTokenFromOrder(order)
  const [menuNameById, catalog] = await Promise.all([loadPosMenuNameById(), loadGrabPosCatalog()])
  const out: PosItem[] = []
  let idx = 0

  for (const raw of rawItems) {
    const item = asRecord(raw)
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity) || 1))
    let flatModifiers = flattenGrabOrderItemModifiers(item)
    flatModifiers = mergeSetChildModifiersFromParent(item, flatModifiers, rawItems)
    let modifierMinor = 0
    const modifierNames: string[] = []
    const pricedModifierSignatures = new Set<string>()
    const pricedModifierFuzzySignatures = new Set<string>()
    const optionCodeSet = new Set<string>()
    for (const mod of flatModifiers) {
      const modQty = Math.max(1, Math.trunc(toNumber(mod.quantity) || 1))
      modifierMinor += toNumber(mod.price) * modQty
      pricedModifierSignatures.add(buildModifierPriceSignature(mod))
      pricedModifierFuzzySignatures.add(buildModifierFuzzySignature(mod))
      const names = extractReadableModifierNames(mod)
      for (const n of names) {
        if (!modifierNames.includes(n)) modifierNames.push(n)
      }
      for (const c of extractOptionCodesFromModifier(mod)) optionCodeSet.add(c)
    }
    for (const mod of extractModifierCandidatesFromItem(item)) {
      // item.modifiers 바깥(중첩 selection/addon)으로 온 가격도 합산
      const sign = buildModifierPriceSignature(mod)
      const fuzzy = buildModifierFuzzySignature(mod)
      if (!pricedModifierSignatures.has(sign) && !pricedModifierFuzzySignatures.has(fuzzy)) {
        const p = toNumber(mod.price ?? mod.amount ?? mod.totalPrice ?? 0)
        const q = Math.max(1, Math.trunc(toNumber(mod.quantity ?? mod.qty ?? 1) || 1))
        if (p > 0) {
          modifierMinor += p * q
          pricedModifierSignatures.add(sign)
          pricedModifierFuzzySignatures.add(fuzzy)
        }
      }
      const names = extractReadableModifierNames(mod)
      for (const n of names) {
        if (!modifierNames.includes(n)) modifierNames.push(n)
      }
      for (const c of extractOptionCodesFromModifier(mod)) optionCodeSet.add(c)
    }
    for (const n of extractReadableOptionsFromItemText(item)) {
      if (!modifierNames.includes(n)) modifierNames.push(n)
    }
    for (const n of extractReadableNamesFromMachineIds(item, menuNameById)) {
      if (!modifierNames.includes(n)) modifierNames.push(n)
    }
    for (const label of resolveOptionCodesToLabels(Array.from(optionCodeSet), catalog.optionNameByCode)) {
      if (!modifierNames.includes(label)) modifierNames.push(label)
    }
    const banbanSlots = extractBanbanSlotNumbersFromItem(item)
    if (banbanSlots.length > 0 && modifierNames.length === 0) {
      // 선택 이름을 못 읽어온 경우에만 슬롯 번호(1,2)로 fallback
      for (const s of banbanSlots) modifierNames.push(s)
    }

    const resolved = resolveGrabItemNameAndMeta(item, catalog)
    const rawDisplayName = String(
      item.name ??
        item.title ??
        item.displayName ??
        item.itemName ??
        item.grabItemName ??
        ''
    ).trim()
    let itemName = resolved.name || rawDisplayName || `Grab item ${idx + 1}`
    const unitBaseMinor = toNumber(item.price)
    const lineMinor = deepReadGrabLineMinorTotal(item) || readLineMinorTotal(item)
    const unitMinorResolved = resolveGrabLineUnitMinor({
      lineMinor,
      qty,
      unitBaseMinor,
      modifierMinorPerLine: modifierMinor,
      itemName: [rawDisplayName || itemName, ...modifierNames].filter(Boolean).join(' + '),
      hasSelections: modifierNames.length > 0 || optionCodeSet.size > 0,
    })
    const optionCodes = Array.from(optionCodeSet)
    const itemBaseId = String(item.id ?? item.grabItemID ?? idx)
    const menuRef = parseGrabPartnerItemMenuRef(itemBaseId)
    const resolvedMenuCode = resolveMenuCodeForGrabLine({
      resolvedMenuId: resolved.menuId,
      menuRef,
      itemName,
      catalog,
    })
    const modifierNamesForNote = normalizeModifierNamesForDisplay({
      names: modifierNames,
      menuCode: resolvedMenuCode,
      optionNameByCode: catalog.optionNameByCode,
    })
    const inferredDefaultSize = inferDefaultSizeLabelForGrabLine(
      resolvedMenuCode,
      modifierNamesForNote,
      optionCodes,
      catalog.optionNameByCode
    )
    if (inferredDefaultSize && !modifierNamesForNote.includes(inferredDefaultSize)) {
      modifierNamesForNote.unshift(inferredDefaultSize)
    }

    let promoId = resolved.promoId
    let promoCode = resolved.promoCode
    if (!promoId && resolved.menuId) {
      promoId = catalog.menuPromoIdByMenuId.get(Number(resolved.menuId))
    }
    const promoRow = promoId ? catalog.promoById.get(String(promoId)) : undefined
    if (!promoCode && promoRow?.code) promoCode = String(promoRow.code).trim() || undefined

    const allPromoCatalogItems = (promoRow?.items?.length
      ? promoRow.items
      : resolved.promoItems || []) as GrabPromoChoiceCatalogRow[]
    let promoItemsSnapshot: NonNullable<PosItem['promoItems']> | undefined
    if (allPromoCatalogItems.length > 0) {
      promoItemsSnapshot = promoCatalogHasChoiceGroups(allPromoCatalogItems)
        ? resolvePromoItemsForGrabOrder({
            allItems: allPromoCatalogItems,
            itemId: itemBaseId,
            flatModifiers,
          })
        : allPromoCatalogItems.map((it) => ({
            menuId: String(it.menuId ?? '').trim(),
            optionId: it.optionId != null && String(it.optionId).trim() ? String(it.optionId).trim() : null,
            ...(it.optionCode ? { optionCode: String(it.optionCode).trim() } : {}),
            ...(it.menuName ? { menuName: String(it.menuName).trim() } : {}),
            ...(it.optionName ? { optionName: String(it.optionName).trim() } : {}),
            quantity: Math.max(1, Number(it.quantity) || 1),
          }))
      if (promoItemsSnapshot?.length) {
        promoItemsSnapshot = enrichGrabPromoItemsWithDefaultSizeFromCatalog(promoItemsSnapshot, catalog)
      }
      if (promoCatalogHasChoiceGroups(allPromoCatalogItems)) {
        const choiceNameKeys = new Set(
          allPromoCatalogItems
            .filter((it) => String(it.choiceGroup ?? '').trim())
            .map((it) => String(it.menuName || it.optionName || '').trim().toLowerCase())
            .filter(Boolean)
        )
        if (choiceNameKeys.size > 0) {
          for (let mi = modifierNamesForNote.length - 1; mi >= 0; mi--) {
            const original = String(modifierNamesForNote[mi] ?? '').trim()
            const lab = original.toLowerCase()
            if (!choiceNameKeys.has(lab)) continue
            if (grabPromoSnapshotIncludesModifierLabel(promoItemsSnapshot, original)) {
              modifierNamesForNote.splice(mi, 1)
            }
          }
        }
      }
    }

    const resolvedMenuRow = resolved.menuId
      ? catalog.menuById.get(Number(resolved.menuId))
      : undefined
    const banbanSlotsProbe = extractGrabBanbanFlavorSlotsFromModifiers(flatModifiers, menuNameById)
    const isBanbanGrabLine =
      isBanbanMenu({
        isBanban: false,
        name: itemName,
        code: resolvedMenuCode,
      }) ||
      (resolvedMenuRow
        ? isBanbanMenu({
            isBanban: false,
            name: resolvedMenuRow.name,
            code: resolvedMenuRow.code,
          })
        : false) ||
      banbanSlotsProbe.flavorMenuIds.length >= 2
    let grabBanbanFlavorMenuId1: string | undefined
    let grabBanbanFlavorMenuId2: string | undefined
    let banbanFlavorsToken = ''
    if (isBanbanGrabLine) {
      const banbanIngest = resolveGrabBanbanPosIngestSnapshot({
        baseItemName: String(resolvedMenuRow?.name ?? itemName).trim() || itemName,
        flatModifiers,
        modifierLabels: modifierNamesForNote,
        menuNameById,
        isBanbanMenuLine: true,
      })
      if (banbanIngest) {
        itemName = banbanIngest.displayName
        modifierNamesForNote.length = 0
        modifierNamesForNote.push(...banbanIngest.remainderModifierLabels)
        if (banbanIngest.flavorMenuId1 && banbanIngest.flavorMenuId2) {
          grabBanbanFlavorMenuId1 = banbanIngest.flavorMenuId1
          grabBanbanFlavorMenuId2 = banbanIngest.flavorMenuId2
        }
        banbanFlavorsToken = banbanIngest.banbanFlavorsNoteToken
      }
    }
    if (!banbanFlavorsToken) {
      itemName = formatGrabKitchenDisplayName(itemName, modifierNamesForNote)
    }
    ensureGrabSidedishModifiersPreservedInNote({
      allModifierLabels: modifierNames,
      modifierNamesForNote,
      promoItems: promoItemsSnapshot,
    })
    const noteParts = [
      pickCustomerReadableText(
        item.specialRequest,
        item.specialInstruction,
        item.instructions,
        item.customerNote,
        item.specifications
      ),
      modifierNamesForNote.length ? `mods:${modifierNamesForNote.join(',')}` : '',
      optionCodes.length ? `optc:${optionCodes.join(',')}` : '',
      banbanFlavorsToken,
      ecoSummary || '',
    ].filter(Boolean)

    const itemNote = noteParts.length ? noteParts.join(' · ') : undefined
    const banbanParentMenuId = resolved.menuId || (menuRef ? String(menuRef.menuId) : undefined)

    const pushPosItem = (unitMinor: number, rowQty: number, rowSuffix: string) => {
      if (rowQty <= 0) return
      // 동일 Grab menu id가 여러 줄(반반 2종 등)일 때 id 충돌 → 포장 체크가 묶이지 않도록 줄 순번 포함
      out.push({
        id: `grab:${itemBaseId}:L${idx}${rowSuffix}`,
        name: itemName,
        price: minorToMajor(unitMinor, exponent),
        qty: rowQty,
        ...(banbanParentMenuId ? { menuId: banbanParentMenuId } : {}),
        ...(grabBanbanFlavorMenuId1 && grabBanbanFlavorMenuId2
          ? { menuId1: grabBanbanFlavorMenuId1, menuId2: grabBanbanFlavorMenuId2 }
          : {}),
        ...(optionCodes.length > 0
          ? {
              optionCodes,
              optionCode: optionCodes[0],
              optionCode1: optionCodes[0],
            }
          : {}),
        ...(promoId ? { promoId } : {}),
        ...(promoCode ? { promoCode } : {}),
        ...(promoItemsSnapshot && promoItemsSnapshot.length > 0 ? { promoItems: promoItemsSnapshot } : {}),
        note: itemNote,
        deliveryAppCode: 'grab',
      })
    }

    if (lineMinor > 0 && qty > 0) {
      // Grab line total을 POS에 정확히 맞추기 위해 minor unit(사탕) 기준으로 수량에 분배
      const baseMinor = Math.max(0, Math.floor(lineMinor / qty))
      const remainder = Math.max(0, lineMinor - baseMinor * qty)
      if (remainder === 0) {
        pushPosItem(baseMinor, qty, '')
      } else {
        // 예: 총 419 / 수량 2 → 210 x1 + 209 x1 (합계 419 정확 일치)
        pushPosItem(baseMinor + 1, remainder, '-hi')
        pushPosItem(baseMinor, qty - remainder, '-lo')
      }
    } else {
      pushPosItem(unitMinorResolved, qty, '')
    }
    idx += 1
  }

  const merged = mergeGrabSetChildLinesIntoPromoParents(out as GrabSetPosLine[], catalog)
  return merged.map((line) => {
    const pi = line.promoItems
    if (!Array.isArray(pi) || pi.length === 0) return line
    const enriched = enrichGrabPromoItemsWithDefaultSizeFromCatalog(pi, catalog)
    return enriched ? { ...line, promoItems: enriched } : line
  })
}

export async function buildGrabPosOrderSnapshot(
  order: Record<string, unknown>
): Promise<GrabPosOrderSnapshot> {
  const items = await buildPosItems(order)
  let subtotal = 0
  for (const item of items) subtotal += item.price * item.qty
  subtotal = Math.round(subtotal * 100) / 100

  const exponent = currencyExponent(order)
  const price = asRecord(order.price)
  /** Grab 고객 배달비 — POS delivery_fee·매장 빌 합계에 포함하지 않음 */
  const grabPlatformDeliveryFee = minorToMajor(price.deliveryFee, exponent)
  const deliveryFee = 0
  const packagingFee = minorToMajor(price.merchantChargeFee, exponent)
  const discountMinor = Math.max(
    0,
    readFirstFinite(
      price.totalDiscount,
      price.totalPromo,
      price.discount,
      price.merchantFundPromo,
      price.promoDiscount,
      0
    )
  )
  const discountAmt = Math.max(0, minorToMajor(discountMinor, exponent))
  const tax = Math.max(0, minorToMajor(price.tax, exponent))
  const totalFromWebhook = Math.max(0, minorToMajor(price.total, exponent))

  const paymentType = String(order.paymentType ?? '').trim().toUpperCase()
  const pricing = computePosPricing({
    subtotal,
    discountAmt,
    deliveryFee,
    packagingFee,
    cardPaymentAmount: 0,
    adjustments: {},
  })
  const total = resolveGrabMerchantPosTotal({
    itemsSubtotal: subtotal,
    pricingFinalTotal: pricing.finalTotal,
    totalFromWebhook,
    grabPlatformDeliveryFee,
  })
  const vat = tax > 0 ? tax : pricing.vatFeeAmt
  const paymentCash = paymentType === 'CASH' ? total : 0
  const paymentDeliveryApp = paymentType === 'CASHLESS' ? total : 0

  return {
    items,
    subtotal,
    discountAmt,
    deliveryFee,
    packagingFee,
    vat,
    total,
    paymentCash,
    paymentDeliveryApp,
    tableName: resolveDisplayName(order),
    orderType: resolveOrderType(order),
  }
}

function resolveOrderType(order: Record<string, unknown>): 'delivery' | 'dine_in' {
  // Grab webhook payload에는 dineIn 관련 객체가 부가적으로 포함될 수 있어
  // 배달 주문이 잘못 dine_in으로 들어가 목록에서 사라지는 케이스가 발생할 수 있다.
  // 명시적 dine-in 타입일 때만 dine_in으로 처리하고, 기본은 delivery로 둔다.
  const explicitType = String(order.orderType ?? order.fulfillmentType ?? order.diningOption ?? '')
    .trim()
    .toLowerCase()
  if (explicitType === 'dine_in' || explicitType === 'dine-in' || explicitType === 'dinein') {
    return 'dine_in'
  }
  return 'delivery'
}

function resolveFulfillmentLabel(order: Record<string, unknown>): string {
  const explicitType = String(order.orderType ?? order.fulfillmentType ?? order.diningOption ?? '')
    .trim()
    .toLowerCase()
  if (explicitType.includes('self') || explicitType.includes('pickup') || explicitType.includes('collect')) {
    return 'Self-collection'
  }
  if (explicitType.includes('restaurant') || explicitType.includes('merchant')) {
    return 'Restaurant delivery'
  }
  if (explicitType.includes('dine')) return 'Dine-in'
  return 'Delivery'
}

function resolveDisplayName(order: Record<string, unknown>): string {
  const short = String(order.shortOrderNumber ?? '').trim()
  const orderID = String(order.orderID ?? '').trim()
  const idSuffix = orderID.length > 10 ? orderID.slice(-8) : orderID
  const receiver = asRecord(order.receiver)
  const receiverName = String(receiver.name ?? '').trim()
  const fulfill = resolveFulfillmentLabel(order)
  const idTail = idSuffix ? ` · ID ${idSuffix}` : ''
  if (short && receiverName) return `Grab #${short} · ${fulfill} · ${receiverName}${idTail}`
  if (short) return `Grab #${short} · ${fulfill}${idTail}`
  if (receiverName) return `Grab · ${fulfill} · ${receiverName}${idTail}`
  return 'Grab'
}

function resolveInitialGrabMemoState(
  order: Record<string, unknown>,
  initialStatus: string
): string {
  const fromPayload = String(order.state ?? order.orderState ?? '').trim()
  if (fromPayload) return fromPayload
  const st = String(initialStatus || '').trim().toLowerCase()
  return st === 'cooking' ? 'ACCEPTED' : 'SUBMITTED'
}

export async function persistGrabOrderToPos(
  order: Record<string, unknown>,
  opts?: { initialStatus?: string }
): Promise<GrabOrderPersistResult> {
  const orderID = String(order.orderID ?? '').trim()
  if (!orderID) return { ok: false, message: 'missing orderID' }

  const storeCodeResolved = resolveGrabStoreCode(order)
  const storeCode = storeCodeResolved ? await resolveCanonicalErpStoreCode(storeCodeResolved) : ''
  if (!storeCode) {
    return {
      ok: false,
      message: 'missing storeCode (set partnerMerchantID or GRAB_STORE_MAP_JSON)',
    }
  }

  const initialStatus = String(opts?.initialStatus || 'pending').trim() || 'pending'
  const grabMemoState = resolveInitialGrabMemoState(order, initialStatus)
  const memo = buildGrabOrderMemo(orderID, grabMemoState)
  const existing = (await supabaseSelectFilter(
    'pos_orders',
    `store_code=eq.${encodeURIComponent(storeCode)}&${grabOrderMemoPostgrestIlikeFilter(orderID)}`,
    { limit: 1, select: 'id,order_no,items_json' }
  )) as { id?: number; order_no?: string; items_json?: string }[]
  if (existing?.[0]?.id) {
    const snapshot = await buildGrabPosOrderSnapshot(order)
    let oldItems: PosItem[] = []
    try {
      oldItems = JSON.parse(String(existing[0].items_json ?? '[]')) as PosItem[]
      if (!Array.isArray(oldItems)) oldItems = []
    } catch {
      oldItems = []
    }
    const oldOptCount = countGrabPosItemOptionSnapshots(oldItems)
    const newOptCount = countGrabPosItemOptionSnapshots(snapshot.items)
    const shouldRefreshItems =
      snapshot.items.length > 0 &&
      (newOptCount > oldOptCount ||
        (oldOptCount === 0 && newOptCount > 0) ||
        JSON.stringify(oldItems) !== JSON.stringify(snapshot.items))
    if (shouldRefreshItems) {
      await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${Number(existing[0].id)}`, {
        items_json: JSON.stringify(snapshot.items),
        subtotal: snapshot.subtotal,
        discount_amt: snapshot.discountAmt,
        discount_reason: resolvePlatformDiscountReasonForSave('grab', snapshot.discountAmt),
        delivery_fee: snapshot.deliveryFee,
        packaging_fee: snapshot.packagingFee,
        vat: snapshot.vat,
        total: snapshot.total,
        payment_cash: snapshot.paymentCash,
        payment_delivery_app: snapshot.paymentDeliveryApp,
      }, 'grabOrderToPos:refreshItems')
    }
    return {
      ok: true,
      orderId: Number(existing[0].id),
      orderNo: String(existing[0].order_no ?? ''),
      duplicate: true,
      storeCode,
    }
  }

  const snapshot = await buildGrabPosOrderSnapshot(order)
  if (!snapshot.items.length) return { ok: false, message: 'no line items' }

  const orderNo = await allocateNextPosOrderNo(storeCode)
  const row = {
    order_no: orderNo,
    store_code: storeCode,
    order_type: snapshot.orderType,
    table_name: snapshot.tableName,
    memo,
    discount_amt: snapshot.discountAmt,
    discount_reason: resolvePlatformDiscountReasonForSave('grab', snapshot.discountAmt),
    delivery_fee: snapshot.deliveryFee,
    packaging_fee: snapshot.packagingFee,
    items_json: JSON.stringify(snapshot.items),
    subtotal: snapshot.subtotal,
    vat: snapshot.vat,
    total: snapshot.total,
    status: initialStatus,
    payment_cash: snapshot.paymentCash,
    payment_card: 0,
    payment_qr: 0,
    payment_other: 0,
    payment_delivery_app: snapshot.paymentDeliveryApp,
    member_id: null,
    member_no: null,
    coupon_code: null,
    coupon_discount_amt: 0,
    point_used: 0,
    point_earned: 0,
    guest_count: 0,
    delivery_app_code: 'grab',
  }

  const inserted = (await supabaseInsertWithPgrst204Fallback('pos_orders', row, 'grabOrderToPos')) as { id?: number }[]
  const created = Array.isArray(inserted) ? inserted[0] : inserted
  if (!created?.id) return { ok: false, message: 'insert failed' }

  await consumeDeliveryMenuStockByName({
    storeCode,
    appCode: 'grab',
    items: snapshot.items.map((item) => ({ name: item.name, qty: item.qty })),
  }).catch(() => {})

  return {
    ok: true,
    orderId: Number(created.id),
    orderNo,
    duplicate: false,
    storeCode,
  }
}

function mapGrabStateToPosStatus(state: string): string | null {
  const s = String(state || '').trim().toUpperCase()
  if (!s) return null
  // 매장 운영 기준: Grab의 배송 완료 신호로 POS 주문을 자동 완료/결제 처리하지 않는다.
  // POS 화면에서 직접 "포장 완료/결제"를 눌러 마감하도록 유지한다.
  if (s === 'REFUNDED') return 'refunded'
  if (s === 'CANCELLED' || s === 'FAILED') return 'cancelled'
  return null
}

function canApplyGrabStatusTransition(prevStatus: string, nextStatus: string): boolean {
  const prev = String(prevStatus || '').trim().toLowerCase()
  const next = String(nextStatus || '').trim().toLowerCase()
  if (!next) return false
  if (!prev) return true
  // POS에서 이미 확정된 상태는 Grab 상태 푸시로 덮어쓰지 않는다.
  if (prev === 'completed' || prev === 'paid' || prev === 'cancelled' || prev === 'refunded') return false
  // 중복 업데이트 방지
  if (prev === next) return false
  // 이 경로에서 허용하는 것은 취소/환불 동기화만
  if (next === 'cancelled' || next === 'refunded') return true
  return false
}

type PosOrderGrabSyncRow = { id?: number; status?: string; memo?: string }

async function loadGrabSubmitOrderWebhookPayload(orderID: string): Promise<Record<string, unknown> | null> {
  try {
    const rows = (await supabaseSelectFilter(
      'pos_grab_webhook_events',
      `event_kind=eq.submit_order&order_id=eq.${encodeURIComponent(orderID)}`,
      { limit: 1, order: 'received_at.desc', select: 'payload_json' }
    )) as { payload_json?: unknown }[] | null
    const raw = rows?.[0]?.payload_json
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>
    }
  } catch {
    // fail-open — memo 조회만으로 진행
  }
  return null
}

/** memo의 grab_order 앵커 조회 실패 시 submit_order 웹훅·table_name(Grab #…)으로 폴백 */
async function findPosOrderRowForGrabStateSync(orderID: string): Promise<PosOrderGrabSyncRow | null> {
  let rows = (await supabaseSelectFilter('pos_orders', grabOrderMemoPostgrestIlikeFilter(orderID), {
    limit: 1,
    select: 'id,status,memo',
  })) as PosOrderGrabSyncRow[]

  if (rows?.[0]?.id) return rows[0] ?? null

  const submitPayload = await loadGrabSubmitOrderWebhookPayload(orderID)
  if (!submitPayload) return null

  const shortOrderNumber = String(submitPayload.shortOrderNumber ?? '').trim()
  if (!shortOrderNumber) return null

  const storeCodeResolved = resolveGrabStoreCode(submitPayload)
  const storeCode = storeCodeResolved ? await resolveCanonicalErpStoreCode(storeCodeResolved) : ''
  const tableFilter = `table_name=ilike.${encodeURIComponent(`%Grab #${shortOrderNumber}%`)}`
  const filter = storeCode
    ? `store_code=eq.${encodeURIComponent(storeCode)}&${tableFilter}`
    : tableFilter

  rows = (await supabaseSelectFilter('pos_orders', filter, {
    limit: 2,
    order: 'created_at.desc',
    select: 'id,status,memo',
  })) as PosOrderGrabSyncRow[]

  if ((rows?.length ?? 0) > 1) return null

  return rows?.[0] ?? null
}

export async function syncGrabOrderStateToPos(params: {
  orderID: string
  state: string
  orderPayload?: unknown
}): Promise<GrabOrderStateSyncResult> {
  const orderID = String(params.orderID || '').trim()
  if (!orderID) return { ok: false, message: 'missing orderID' }

  const incomingState = String(params.state || '').trim()
  if (!incomingState) return { ok: false, message: 'missing state' }

  const nextStatus = mapGrabStateToPosStatus(incomingState)

  let row = await findPosOrderRowForGrabStateSync(orderID)

  if (!row?.id && params.orderPayload && typeof params.orderPayload === 'object') {
    const persisted = await persistGrabOrderToPos(params.orderPayload as Record<string, unknown>)
    if (!persisted.ok) {
      return { ok: false, message: `order_not_found_and_create_failed:${persisted.message}` }
    }
    row =
      ((await supabaseSelectFilter('pos_orders', `id=eq.${persisted.orderId}`, {
        limit: 1,
        select: 'id,status,memo',
      })) as PosOrderGrabSyncRow[])?.[0] ?? null
  }

  if (!row?.id) return { ok: false, message: 'pos_order_not_found' }

  const prevMemo = String(row.memo ?? '')
  const mergedMemo = mergeGrabStateIntoFullMemo(prevMemo, orderID, incomingState)
  const memoChanged = mergedMemo !== prevMemo

  let statusUpdated = false
  const prevStatus = String(row.status ?? '').trim().toLowerCase()
  if (nextStatus && canApplyGrabStatusTransition(prevStatus, nextStatus)) {
    await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${Number(row.id)}`, {
      status: nextStatus,
      ...(memoChanged ? { memo: mergedMemo } : {}),
    }, 'grabOrderToPos:status')
    statusUpdated = true
  } else if (memoChanged) {
    await supabaseUpdateByFilterWithPgrst204Fallback('pos_orders', `id=eq.${Number(row.id)}`, { memo: mergedMemo }, 'grabOrderToPos:memo')
  }

  const updated = statusUpdated || memoChanged
  return {
    ok: true,
    updated,
    memoUpdated: memoChanged,
    orderId: Number(row.id),
    status: nextStatus || undefined,
    grabState: incomingState,
  }
}
