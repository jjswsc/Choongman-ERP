import type { PosMenu, PosMenuOption, PosPromoWithItems } from '@/lib/api-client'
import { normalizePosLineNote } from '@/lib/pos-line-note'

export type GrabPosPromoCatalogRow = Pick<PosPromoWithItems, 'id' | 'name' | 'code' | 'items'>

export type GrabPosCatalog = {
  menuById: Map<number, { id: string; name: string; code: string }>
  menuByCode: Map<string, { id: string; name: string; code: string }>
  optionNameByCode: Map<string, string>
  promoByCode: Map<string, GrabPosPromoCatalogRow>
  promoByNameKey: Map<string, GrabPosPromoCatalogRow>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toNumber(value: unknown): number {
  if (typeof value === 'string') return Number(value) || 0
  return Number(value) || 0
}

function readFirstFinite(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 0
}

/** POS `pos_menu_options.option_code` 형태 (예: C020-1, C009-5) */
export function isLikelyPosOptionCode(raw: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+(?:-[A-Za-z0-9]+)*$/i.test(String(raw || '').trim())
}

export function isMachineLikeGrabToken(raw: string): boolean {
  const s = String(raw || '').trim()
  if (!s) return true
  if (isLikelyPosOptionCode(s)) return false
  if (/^(mods?:|optc:)/i.test(s)) return true
  if (/^(mods?:)?[a-z]+-\d+(?:-[a-z0-9]+)*$/i.test(s)) return true
  if (/^THITE\d/i.test(s)) return true
  if (/^[a-z0-9_-]{16,}$/i.test(s) && !/\s/.test(s)) return true
  return false
}

/** Grab 메뉴 item id: `item-{menuId}-{code}` */
export function parseGrabPartnerItemMenuRef(raw: string): { menuId: number; code: string } | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const stripped = s.replace(/^grab:/i, '')
  const m = /^item-(\d+)(?:-(.+))?$/i.exec(stripped)
  if (!m?.[1]) return null
  const menuId = Number(m[1])
  if (!Number.isFinite(menuId) || menuId <= 0) return null
  return { menuId, code: String(m[2] ?? '').trim() }
}

export function looksLikeGrabCampaignSku(raw: string): boolean {
  const s = String(raw || '').trim()
  return /^THITE\d/i.test(s)
}

function normalizePromoLookupText(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function buildGrabPosCatalog(
  menus: Array<{ id?: unknown; name?: unknown; code?: unknown }>,
  options: Array<{ optionCode?: unknown; option_code?: unknown; name?: unknown }>,
  promos: GrabPosPromoCatalogRow[] = []
): GrabPosCatalog {
  const menuById = new Map<number, { id: string; name: string; code: string }>()
  const menuByCode = new Map<string, { id: string; name: string; code: string }>()
  for (const row of menus) {
    const id = Number(row.id ?? 0)
    const name = String(row.name ?? '').trim()
    const code = String(row.code ?? '').trim()
    if (!id || !name) continue
    const entry = { id: String(id), name, code }
    menuById.set(id, entry)
    if (code) menuByCode.set(code.toLowerCase(), entry)
  }
  const optionNameByCode = new Map<string, string>()
  for (const opt of options) {
    const code = String(opt.optionCode ?? (opt as { option_code?: unknown }).option_code ?? '').trim()
    const name = String(opt.name ?? '').trim()
    if (!code || !name) continue
    optionNameByCode.set(code.toUpperCase(), name)
  }
  const promoByCode = new Map<string, GrabPosPromoCatalogRow>()
  const promoByNameKey = new Map<string, GrabPosPromoCatalogRow>()
  for (const p of promos) {
    const code = String(p.code ?? '').trim()
    const nameKey = normalizePromoLookupText(p.name)
    if (code) promoByCode.set(code.toLowerCase(), p)
    if (nameKey) promoByNameKey.set(nameKey, p)
  }
  return { menuById, menuByCode, optionNameByCode, promoByCode, promoByNameKey }
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

function extractCampaignReadableName(item: Record<string, unknown>): string {
  const direct = pickCustomerReadableText(
    item.campaignName,
    item.promotionName,
    item.promoName,
    item.bundleName,
    item.setName,
    item.externalItemName,
    item.merchantItemName,
    item.localizedName,
    item.translatedName
  )
  if (direct) return direct
  const campaign = asRecord(item.campaignInfo)
  const fromCampaign = pickCustomerReadableText(
    campaign.name,
    campaign.title,
    campaign.campaignName,
    campaign.promotionName,
    campaign.displayName
  )
  if (fromCampaign) return fromCampaign
  const nestedItems = Array.isArray(item.items) ? item.items : Array.isArray(item.subItems) ? item.subItems : []
  const nestedNames: string[] = []
  for (const raw of nestedItems) {
    const row = asRecord(raw)
    const nm = pickCustomerReadableText(row.name, row.title, row.displayName, row.itemName)
    if (nm) nestedNames.push(nm)
  }
  if (nestedNames.length > 0) return nestedNames.join(' / ')
  return ''
}

function matchPromoFromCatalog(rawName: string, catalog: GrabPosCatalog): GrabPosPromoCatalogRow | null {
  const key = normalizePromoLookupText(rawName)
  if (!key) return null
  const byCode = catalog.promoByCode.get(key)
  if (byCode) return byCode
  const byName = catalog.promoByNameKey.get(key)
  if (byName) return byName
  for (const [code, promo] of catalog.promoByCode.entries()) {
    if (key.includes(code) || code.includes(key)) return promo
  }
  for (const [nameKey, promo] of catalog.promoByNameKey.entries()) {
    if (key.includes(nameKey) || nameKey.includes(key)) return promo
  }
  return null
}

export function resolveGrabItemNameAndMeta(
  item: Record<string, unknown>,
  catalog: GrabPosCatalog
): {
  name: string
  menuId?: string
  promoId?: string
  promoCode?: string
  promoItems?: GrabPosPromoCatalogRow['items']
} {
  const rawId = String(item.id ?? item.grabItemID ?? '').trim()
  const rawName = String(
    item.name ?? item.title ?? item.displayName ?? item.itemName ?? item.grabItemName ?? ''
  ).trim()

  const menuRef = parseGrabPartnerItemMenuRef(rawId) || parseGrabPartnerItemMenuRef(rawName)
  if (menuRef) {
    const menu = catalog.menuById.get(menuRef.menuId)
    if (menu?.name) {
      return { name: menu.name, menuId: menu.id }
    }
    const menuByCode = menuRef.code ? catalog.menuByCode.get(menuRef.code.toLowerCase()) : undefined
    if (menuByCode?.name) {
      return { name: menuByCode.name, menuId: menuByCode.id }
    }
  }

  if (rawName && !isMachineLikeGrabToken(rawName)) {
    const codeKey = rawName.toLowerCase()
    const byCode = catalog.menuByCode.get(codeKey)
    if (byCode?.name) return { name: byCode.name, menuId: byCode.id }
    return { name: rawName }
  }

  const campaignName = extractCampaignReadableName(item)
  if (campaignName) {
    const promo = matchPromoFromCatalog(campaignName, catalog)
    if (promo) {
      return {
        name: String(promo.name ?? campaignName).trim() || campaignName,
        promoId: String(promo.id ?? '').trim() || undefined,
        promoCode: String(promo.code ?? '').trim() || undefined,
        promoItems: Array.isArray(promo.items) ? promo.items : undefined,
      }
    }
    return { name: campaignName }
  }

  if (looksLikeGrabCampaignSku(rawName) || isMachineLikeGrabToken(rawName)) {
    const promo = matchPromoFromCatalog(rawName, catalog)
    if (promo) {
      return {
        name: String(promo.name ?? '').trim() || rawName,
        promoId: String(promo.id ?? '').trim() || undefined,
        promoCode: String(promo.code ?? '').trim() || undefined,
        promoItems: Array.isArray(promo.items) ? promo.items : undefined,
      }
    }
    const deepTitle = deepPickReadableTitleFromPayload(item)
    if (deepTitle) {
      const promoFromTitle = matchPromoFromCatalog(deepTitle, catalog)
      if (promoFromTitle) {
        return {
          name: String(promoFromTitle.name ?? deepTitle).trim() || deepTitle,
          promoId: String(promoFromTitle.id ?? '').trim() || undefined,
          promoCode: String(promoFromTitle.code ?? '').trim() || undefined,
          promoItems: Array.isArray(promoFromTitle.items) ? promoFromTitle.items : undefined,
        }
      }
      return { name: deepTitle }
    }
  }

  return { name: rawName || rawId || 'Grab item' }
}

function deepPickReadableTitleFromPayload(item: Record<string, unknown>): string {
  const visited = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: item, depth: 0 }]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { value, depth } = node
    if (depth > 4 || value == null) continue
    if (typeof value !== 'object') continue
    if (visited.has(value)) continue
    visited.add(value)
    if (Array.isArray(value)) {
      for (const x of value) queue.push({ value: x, depth: depth + 1 })
      continue
    }
    const rec = asRecord(value)
    for (const [kRaw, v] of Object.entries(rec)) {
      const k = String(kRaw || '').trim().toLowerCase()
      if (v && typeof v === 'object') {
        queue.push({ value: v, depth: depth + 1 })
        continue
      }
      if (typeof v !== 'string') continue
      const isNameKey =
        k.includes('name') || k.includes('title') || k.includes('label') || k.includes('display')
      if (!isNameKey) continue
      const text = pickCustomerReadableText(v)
      if (text) return text
    }
  }
  return ''
}

export function resolveOptionCodesToLabels(
  codes: string[],
  optionNameByCode: Map<string, string>
): string[] {
  const getCodeLabelCaseInsensitive = (codeUpper: string): string | null => {
    const exact = optionNameByCode.get(codeUpper)
    if (exact) return exact
    const lower = optionNameByCode.get(codeUpper.toLowerCase())
    if (lower) return lower
    for (const [k, v] of optionNameByCode.entries()) {
      if (String(k || '').trim().toUpperCase() === codeUpper) return v
    }
    return null
  }

  const resolveLabelByCode = (raw: string): string => {
    const code = String(raw || '').trim().toUpperCase()
    if (!code) return ''
    const exact = getCodeLabelCaseInsensitive(code)
    if (exact) return exact

    // Grab note 코드가 C020-1-2 처럼 더 길 때, POS option_code 접두(C020-1 / C020)로 fallback
    const parts = code.split('-').filter(Boolean)
    while (parts.length > 1) {
      parts.pop()
      const prefix = parts.join('-')
      const byPrefix = getCodeLabelCaseInsensitive(prefix)
      if (byPrefix) return byPrefix
    }

    for (const [k, v] of optionNameByCode.entries()) {
      const kk = String(k || '').trim().toUpperCase()
      if (kk.startsWith(`${code}-`)) return v
    }
    return code
  }

  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of codes) {
    const label = resolveLabelByCode(raw)
    if (!label) continue
    const codeKey = String(raw || '').trim().toUpperCase()
    if (codeKey && label.toUpperCase() === codeKey) continue
    const nk = label.toLowerCase()
    if (seen.has(nk)) continue
    seen.add(nk)
    out.push(label)
  }
  return out
}

function toOptionNameByCodeMap(
  optionNameByCode?: Map<string, string> | Record<string, string>
): Map<string, string> {
  if (optionNameByCode instanceof Map) return optionNameByCode
  const out = new Map<string, string>()
  if (!optionNameByCode || typeof optionNameByCode !== 'object') return out
  for (const [k, v] of Object.entries(optionNameByCode)) {
    const code = String(k ?? '').trim()
    const name = String(v ?? '').trim()
    if (!code || !name) continue
    out.set(code.toUpperCase(), name)
  }
  return out
}

/** 영수증·주방 인쇄: Grab 줄 note(optc/mods/코드 나열)를 사람이 읽는 옵션 문구로 */
export function formatGrabOrderLineNoteForPrint(
  rawNote: string | null | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const raw = String(rawNote ?? '').trim()
  if (!raw) return ''
  const map = toOptionNameByCodeMap(optionNameByCode)
  const hasGrabOptionToken = /(?:^|[\s·,])[A-Za-z][A-Za-z0-9]*-\d+/.test(raw)
  const shouldUseGrabParser = /(?:^|\s)(mods?:|optc:)/i.test(raw) || hasGrabOptionToken
  if (!shouldUseGrabParser) return normalizePosLineNote(raw, { keepOptionSummary: false })
  const grabMeta = resolveGrabDeliveryLineNote(raw, map)
  const option = String(grabMeta.optionSummary || '').trim()
  const request = String(grabMeta.requestSummary || '').trim()
  if (option || request) return [option, request].filter(Boolean).join(' · ')
  if (hasGrabOptionToken || /(?:^|\s)(mods?:|optc:)/i.test(raw)) return ''
  return normalizePosLineNote(raw, { keepOptionSummary: false })
}

/** 메뉴명 괄호 옵션·콤마 나열 등 짧은 옵션 조각을 사람이 읽는 문구로 */
export function formatGrabOptionFragmentForPrint(
  raw: string | null | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  const map = toOptionNameByCodeMap(optionNameByCode)
  if (!/[A-Za-z][A-Za-z0-9]*-\d+/.test(text) && !/(?:^|\s)(mods?:|optc:)/i.test(text)) {
    return text
  }
  return formatGrabOrderLineNoteForPrint(text, map) || text
}

export function parseOptcCodesFromNote(note: string): string[] {
  const chunks = String(note || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const chunk of chunks) {
    const m = /^optc:\s*(.+)$/i.exec(chunk)
    if (!m?.[1]) continue
    for (const part of m[1].split(',')) {
      const code = String(part || '').trim()
      if (code) out.push(code)
    }
  }
  return out
}

/** 배달 패널·영수증: Grab 줄 note의 optc/mods를 사람이 읽을 옵션 요약으로 */
export function resolveGrabDeliveryLineNote(
  rawNote: string | null | undefined,
  optionNameByCode: Map<string, string>
): { optionSummary: string; optionChips: string[]; requestSummary: string } {
  const note = String(rawNote ?? '').trim()
  if (!note) return { optionSummary: '', optionChips: [], requestSummary: '' }
  const chunks = note
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  const optionLabels: string[] = []
  const requests: string[] = []
  const seen = new Set<string>()
  const pushHumanOption = (label: string) => {
    const s = String(label || '').trim()
    if (!s || isMachineLikeGrabToken(s)) return
    const nk = s.toLowerCase()
    if (seen.has(nk)) return
    seen.add(nk)
    optionLabels.push(s)
  }

  const pushOptionToken = (token: string) => {
    const raw = String(token || '').trim()
    if (!raw) return
    if (/^\d+$/.test(raw)) return
    if (isLikelyPosOptionCode(raw)) {
      const codeKey = raw.toUpperCase()
      for (const label of resolveOptionCodesToLabels([raw], optionNameByCode)) {
        if (label && label.toUpperCase() !== codeKey) pushHumanOption(label)
      }
      return
    }
    pushHumanOption(raw)
  }

  const pushMixedCommaChunk = (chunk: string): boolean => {
    const rawParts = String(chunk || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (rawParts.length <= 1) return false
    let consumedAny = false
    let allMachine = true
    for (const part of rawParts) {
      if (/^\d+$/.test(part)) continue
      if (isLikelyPosOptionCode(part)) {
        pushOptionToken(part)
        consumedAny = true
        continue
      }
      if (isMachineLikeGrabToken(part)) continue
      allMachine = false
      pushHumanOption(part)
      consumedAny = true
    }
    return consumedAny || allMachine
  }

  for (const chunk of chunks) {
    const modMatch = /^mods:\s*(.+)$/i.exec(chunk)
    if (modMatch?.[1]) {
      for (const part of modMatch[1].split(',')) pushOptionToken(part)
      continue
    }
    const optcMatch = /^optc:\s*(.+)$/i.exec(chunk)
    if (optcMatch?.[1]) {
      const codes = optcMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
      for (const code of codes) pushOptionToken(code)
      continue
    }
    if (/^eco:/i.test(chunk)) {
      requests.push(chunk)
      continue
    }
    const normalizedChunk = String(chunk || '')
      .replace(/^(item\s*note|line\s*note|note)\s*:\s*/i, '')
      .trim()
    if (!normalizedChunk) continue

    if (normalizedChunk.includes(',') && pushMixedCommaChunk(normalizedChunk)) continue
    if (isLikelyPosOptionCode(normalizedChunk)) {
      pushOptionToken(normalizedChunk)
      continue
    }
    if (isMachineLikeGrabToken(normalizedChunk)) continue
    requests.push(normalizedChunk)
  }

  return {
    optionSummary: optionLabels.join(', '),
    optionChips: optionLabels,
    requestSummary: requests.join(' · '),
  }
}

export function deepReadGrabLineMinorTotal(item: Record<string, unknown>): number {
  const direct = readFirstFinite(
    item.subtotal,
    item.totalPrice,
    item.total,
    item.finalPrice,
    item.amount,
    item.lineAmount,
    item.priceInMinor,
    item.priceInMinorUnit,
    item.itemSubtotal
  )
  if (direct > 0) return direct

  const priceObj = asRecord(item.price)
  const nested = readFirstFinite(
    priceObj.subtotal,
    priceObj.totalPrice,
    priceObj.total,
    priceObj.amount,
    priceObj.inMinor,
    priceObj.value
  )
  if (nested > 0) return nested

  const visited = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: item, depth: 0 }]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { value, depth } = node
    if (depth > 3 || value == null || typeof value !== 'object') continue
    if (visited.has(value)) continue
    visited.add(value)
    const rec = asRecord(value)
    for (const [kRaw, v] of Object.entries(rec)) {
      const k = String(kRaw || '').trim().toLowerCase()
      if (typeof v === 'number' || typeof v === 'string') {
        if (
          k.includes('subtotal') ||
          k.includes('totalprice') ||
          k === 'total' ||
          k.includes('lineamount') ||
          (k === 'amount' && depth > 0)
        ) {
          const n = toNumber(v)
          if (n > 0) return n
        }
      }
      if (v && typeof v === 'object') queue.push({ value: v, depth: depth + 1 })
    }
  }
  return 0
}

/** Grab 품목명에 사이즈·파트가 붙어 있으면 item.price가 옵션 포함가인 경우가 많다 */
export function grabItemNameImpliesAllInPrice(name: string): boolean {
  const s = String(name || '').trim()
  if (!s) return false
  if (s.includes('+')) return true
  if (/\b\+\s*[SML]\b/i.test(s)) return true
  if (/\s-\s*(boneless|drumette|wing|leg|mix)/i.test(s)) return true
  if (/\b(part|size|sidedish|side dish)\b/i.test(s)) return true
  if (/\bpart\s*-/i.test(s)) return true
  return false
}

/**
 * Grab 줄 단가(minor). line total이 있으면 우선.
 * line total이 없을 때 item.price가 이미 옵션 포함가이면 modifier 합산을 하지 않는다.
 */
/**
 * Grab `price.deliveryFee`는 고객→플랫폼 배달비(매장 주방·간단주문서 합계에 넣지 않음).
 * POS `total`은 품목 합(subtotal) 기준; 웹훅 total에 배달비가 포함돼 있으면 차감해 맞춘다.
 */
export function resolveGrabMerchantPosTotal(params: {
  itemsSubtotal: number
  pricingFinalTotal: number
  totalFromWebhook: number
  grabPlatformDeliveryFee: number
}): number {
  const sub = Math.max(0, Number(params.itemsSubtotal) || 0)
  const priced = Math.max(0, Number(params.pricingFinalTotal) || 0)
  const webhook = Math.max(0, Number(params.totalFromWebhook) || 0)
  const grabDel = Math.max(0, Number(params.grabPlatformDeliveryFee) || 0)
  if (webhook > 0 && grabDel > 0.009) {
    const foodFromWebhook = Math.round((webhook - grabDel) * 100) / 100
    if (Math.abs(foodFromWebhook - priced) <= 0.05 || Math.abs(foodFromWebhook - sub) <= 0.05) {
      return foodFromWebhook
    }
  }
  if (webhook > 0 && Math.abs(webhook - priced) <= 0.05) return webhook
  if (webhook > 0 && grabDel <= 0.009 && Math.abs(webhook - sub) <= 0.05) return webhook
  return priced > 0 ? priced : sub
}

export function resolveGrabLineUnitMinor(params: {
  lineMinor: number
  qty: number
  unitBaseMinor: number
  modifierMinorPerLine: number
  itemName?: string
  hasSelections?: boolean
}): number {
  const { lineMinor, qty, unitBaseMinor, modifierMinorPerLine, itemName, hasSelections } = params
  const q = Math.max(1, Math.trunc(qty) || 1)
  if (lineMinor > 0) return Math.max(0, Math.floor(lineMinor / q))

  const modifierPerUnit = Math.max(0, Math.floor(modifierMinorPerLine / q))
  if (modifierPerUnit <= 0) return Math.max(0, unitBaseMinor)
  if (hasSelections && unitBaseMinor > 0) return Math.max(0, unitBaseMinor)

  const combined = unitBaseMinor + modifierPerUnit
  if (grabItemNameImpliesAllInPrice(String(itemName ?? ''))) {
    return Math.max(0, unitBaseMinor)
  }
  return combined
}

export function buildOptionNameByCodeFromMenus(
  menus: PosMenu[] | undefined,
  menuOptions: PosMenuOption[] | undefined
): Map<string, string> {
  const catalog = buildGrabPosCatalog(menus || [], menuOptions || [])
  return catalog.optionNameByCode
}
