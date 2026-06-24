import type { PosMenu, PosMenuOption, PosPromoWithItems } from '@/lib/api-client'
import { parseBanbanFlavorsFromPersistedNote } from '@/lib/pos-banban-utils'
import { normalizePosLineNote } from '@/lib/pos-line-note'

export type GrabPosPromoCatalogRow = Pick<PosPromoWithItems, 'id' | 'name' | 'code' | 'items'>

export type GrabPosCatalog = {
  menuById: Map<number, { id: string; name: string; code: string }>
  menuByCode: Map<string, { id: string; name: string; code: string }>
  optionNameByCode: Map<string, string>
  promoByCode: Map<string, GrabPosPromoCatalogRow>
  promoByNameKey: Map<string, GrabPosPromoCatalogRow>
  promoById: Map<string, GrabPosPromoCatalogRow>
  /** 프로모 미러 메뉴 id → promo_id */
  menuPromoIdByMenuId: Map<number, string>
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
  return /^[A-Za-z0-9][A-Za-z0-9]*-\d+(?:-[A-Za-z0-9]+)*$/i.test(String(raw || '').trim())
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
  return /^THITE\d/i.test(s) || /^\d{5,}-S\d+$/i.test(s)
}

function normalizePromoLookupText(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normalizePromoCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
}

function extractPromoCodeCandidatesFromText(raw: string): string[] {
  const text = String(raw || '').trim()
  if (!text) return []
  const out = new Set<string>()
  const full = normalizePromoCode(text)
  if (full && /[A-Z]/.test(full)) out.add(full)
  const matches = text.match(/[A-Za-z][A-Za-z0-9_-]{1,31}/g) || []
  for (const token of matches) {
    const code = normalizePromoCode(token)
    if (!code || !/[A-Z]/.test(code)) continue
    out.add(code)
  }
  return Array.from(out)
}

export function buildGrabPosCatalog(
  menus: Array<{ id?: unknown; name?: unknown; code?: unknown }>,
  options: Array<{ optionCode?: unknown; option_code?: unknown; name?: unknown }>,
  promos: GrabPosPromoCatalogRow[] = [],
  menuPromoIdByMenuId: Map<number, string> = new Map()
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
  const promoById = new Map<string, GrabPosPromoCatalogRow>()
  for (const p of promos) {
    const id = String(p.id ?? '').trim()
    const code = normalizePromoCode(String(p.code ?? '').trim())
    const nameKey = normalizePromoLookupText(p.name)
    if (id) promoById.set(id, p)
    if (code) promoByCode.set(code, p)
    if (nameKey) promoByNameKey.set(nameKey, p)
  }
  return {
    menuById,
    menuByCode,
    optionNameByCode,
    promoByCode,
    promoByNameKey,
    promoById,
    menuPromoIdByMenuId,
  }
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

function findPromoByCodeCandidates(
  candidates: string[],
  catalog: GrabPosCatalog
): GrabPosPromoCatalogRow | null {
  for (const candidate of candidates) {
    const hit = catalog.promoByCode.get(normalizePromoCode(candidate))
    if (hit) return hit
  }
  return null
}

function matchPromoFromCatalog(
  rawName: string,
  catalog: GrabPosCatalog,
  opts?: { allowExactNameFallback?: boolean }
): GrabPosPromoCatalogRow | null {
  const codeHit = findPromoByCodeCandidates(extractPromoCodeCandidatesFromText(rawName), catalog)
  if (codeHit) return codeHit
  if (!opts?.allowExactNameFallback) return null
  const key = normalizePromoLookupText(rawName)
  if (!key) return null
  return catalog.promoByNameKey.get(key) || null
}

function collectPromoCodeCandidatesFromItem(item: Record<string, unknown>): string[] {
  const candidates = new Set<string>()
  const addFrom = (value: unknown) => {
    const s = String(value ?? '').trim()
    if (!s) return
    for (const code of extractPromoCodeCandidatesFromText(s)) {
      candidates.add(code)
    }
  }
  addFrom(item.promoCode)
  addFrom(item.promo_code)
  addFrom(item.promotionCode)
  addFrom(item.promotion_code)
  addFrom(item.campaignCode)
  addFrom(item.campaign_code)
  addFrom(item.bundleCode)
  addFrom(item.bundle_code)
  addFrom(item.setCode)
  addFrom(item.set_code)
  const campaign = asRecord(item.campaignInfo)
  addFrom(campaign.code)
  addFrom(campaign.campaignCode)
  addFrom(campaign.promotionCode)
  return Array.from(candidates)
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

  const promoByItemCodes = findPromoByCodeCandidates(collectPromoCodeCandidatesFromItem(item), catalog)
  if (promoByItemCodes) {
    return {
      name: String(promoByItemCodes.name ?? rawName).trim() || rawName || 'Grab item',
      promoId: String(promoByItemCodes.id ?? '').trim() || undefined,
      promoCode: String(promoByItemCodes.code ?? '').trim() || undefined,
      promoItems: Array.isArray(promoByItemCodes.items) ? promoByItemCodes.items : undefined,
    }
  }

  if (rawName && !isMachineLikeGrabToken(rawName)) {
    const codeKey = rawName.toLowerCase()
    const byCode = catalog.menuByCode.get(codeKey)
    if (byCode?.name) return { name: byCode.name, menuId: byCode.id }
    const promoByExactName = matchPromoFromCatalog(rawName, catalog, { allowExactNameFallback: true })
    if (promoByExactName) {
      return {
        name: String(promoByExactName.name ?? rawName).trim() || rawName,
        promoId: String(promoByExactName.id ?? '').trim() || undefined,
        promoCode: String(promoByExactName.code ?? '').trim() || undefined,
        promoItems: Array.isArray(promoByExactName.items) ? promoByExactName.items : undefined,
      }
    }
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

/** Grab 웹훅/API 유입 주문(수동 배달·홀과 구분) */
export function isGrabInboundPosOrder(params: {
  memo?: string | null
  deliveryAppCode?: string | null
  items?: Array<{ id?: string; deliveryAppCode?: string }>
}): boolean {
  if (String(params.deliveryAppCode ?? '').trim().toLowerCase() === 'grab') return true
  if (/grab_order:/i.test(String(params.memo ?? ''))) return true
  for (const it of params.items ?? []) {
    if (/^grab:/i.test(String(it.id ?? ''))) return true
    if (String(it.deliveryAppCode ?? '').trim().toLowerCase() === 'grab') return true
  }
  return false
}

/**
 * Grab 인쇄 전용: 옵션을 한 줄씩(캐셔 Item / 주방 - 줄).
 * 홀·수동 배달은 이 함수를 쓰지 않는다.
 */
export function collectGrabPrintOptionLines(input: {
  note?: string | null
  optionFragment?: string | null
  optionNameByCode?: Map<string, string> | Record<string, string>
}): string[] {
  const map = toOptionNameByCodeMap(input.optionNameByCode)
  const seen = new Set<string>()
  const out: string[] = []
  const push = (label: string) => {
    const s = String(label ?? '').trim()
    if (!s || isMachineLikeGrabToken(s)) return
    const key = s.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(s)
  }
  const frag = String(input.optionFragment ?? '').trim()
  if (frag) {
    const parsedFrag = formatGrabOptionFragmentForPrint(frag, map)
    if (parsedFrag) {
      const fragMeta = resolveGrabDeliveryLineNote(
        /(?:^|\s)(mods?:|optc:)/i.test(parsedFrag) ? parsedFrag : `mods:${parsedFrag}`,
        map
      )
      for (const chip of fragMeta.optionChips) push(chip)
      if (fragMeta.optionChips.length === 0) push(parsedFrag)
    }
  }
  const noteMeta = resolveGrabDeliveryLineNote(input.note, map)
  for (const chip of noteMeta.optionChips) push(chip)
  const banbanPair = parseBanbanFlavorsFromPersistedNote(input.note)
  if (banbanPair) {
    push(banbanPair.flavor1)
    push(banbanPair.flavor2)
  }
  return out
}

/** Grab 1회용 수저·포크 선택 — `eco:` note 청크 */
export function isGrabEcoCutleryNoteChunk(chunk: string): boolean {
  return /^eco:/i.test(String(chunk ?? '').trim())
}

function readGrabEcoCutleryBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === 'true' || s === 'yes' || s === '1') return true
    if (s === 'false' || s === 'no' || s === '0') return false
  }
  const n = Number(value)
  if (Number.isFinite(n)) return n > 0
  return null
}

function isGrabOrderCutleryPayloadKey(key: string): boolean {
  const k = String(key || '').trim().toLowerCase()
  if (!k) return false
  return (
    k === 'cutlery' ||
    k.endsWith('_cutlery') ||
    k.includes('cutleryrequested') ||
    k.includes('utensilrequested') ||
    (k.includes('plastic') && (k.includes('cutlery') || k.includes('utensil')))
  )
}

function grabEcoCutleryNoteTokenFromBoolean(requested: boolean): string {
  return requested ? 'eco:plastic cutlery requested' : 'eco:no plastic cutlery requested'
}

/**
 * Grab submit_order `cutlery` 등 주문 본문에서 1회용 수저·포크 선택을 읽는다.
 * Grab Partner API Order.cutlery (boolean) 포함.
 */
export function resolveGrabEcoCutleryNoteTokenFromOrder(order: Record<string, unknown>): string | null {
  const direct = readGrabEcoCutleryBoolean(order.cutlery)
  if (direct != null) return grabEcoCutleryNoteTokenFromBoolean(direct)

  const visited = new Set<unknown>()
  const queue: Array<{ value: unknown; depth: number }> = [{ value: order, depth: 0 }]
  let found: boolean | null = null
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    const { value, depth } = node
    if (depth > 4 || value == null) continue
    if (typeof value !== 'object') continue
    if (visited.has(value)) continue
    visited.add(value)
    const rec = asRecord(value)
    for (const [kRaw, v] of Object.entries(rec)) {
      if (isGrabOrderCutleryPayloadKey(String(kRaw || ''))) {
        const parsed = readGrabEcoCutleryBoolean(v)
        if (parsed != null) found = parsed
      }
      if (v && typeof v === 'object') queue.push({ value: v, depth: depth + 1 })
    }
  }
  if (found == null) return null
  return grabEcoCutleryNoteTokenFromBoolean(found)
}

/** items_json note 에서 첫 `eco:` 청크 */
export function findGrabEcoCutleryNoteTokenInItems(
  items: Array<{ note?: string | null | undefined }>
): string | null {
  for (const it of items) {
    const note = String(it.note ?? '').trim()
    if (!note) continue
    for (const chunk of note.split('·').map((s) => s.trim()).filter(Boolean)) {
      if (isGrabEcoCutleryNoteChunk(chunk)) return chunk
    }
  }
  return null
}

/** 영수증·주방 체크리스트 한 줄 (번역) */
export function resolveGrabEcoCutleryChecklistLabel(
  ecoToken: string | null | undefined,
  t?: (key: string) => string
): string {
  const token = String(ecoToken ?? '').trim()
  if (!token || !isGrabEcoCutleryNoteChunk(token)) return ''
  if (t) return translateGrabEcoCutleryChunk(token, t)
  const kind = parseGrabEcoCutleryKind(token)
  return kind ? GRAB_ECO_CUTLERY_FALLBACK_EN[kind] : token
}

export function resolveGrabEcoCutleryChecklistLabelFromItems(
  items: Array<{ note?: string | null | undefined }>,
  t?: (key: string) => string
): string {
  return resolveGrabEcoCutleryChecklistLabel(findGrabEcoCutleryNoteTokenInItems(items), t)
}

export type GrabEcoCutleryKind = 'requested' | 'not_requested'

const GRAB_ECO_CUTLERY_I18N_KEY: Record<GrabEcoCutleryKind, string> = {
  requested: 'posGrabEcoCutleryRequested',
  not_requested: 'posGrabEcoCutleryNotRequested',
}

const GRAB_ECO_CUTLERY_FALLBACK_EN: Record<GrabEcoCutleryKind, string> = {
  requested: 'CUTLERY: YES',
  not_requested: 'CUTLERY: NO',
}

/** Grab 홀·손님 영수증 — 영어 고정(열전사 가독성) */
export const GRAB_ECO_CUTLERY_RECEIPT_PRINT_EN: Record<GrabEcoCutleryKind, string> = {
  requested: 'CUTLERY: YES',
  not_requested: 'CUTLERY: NO',
}

export function resolveGrabEcoCutleryReceiptPrintLabel(
  ecoToken: string | null | undefined
): string {
  const token = String(ecoToken ?? '').trim()
  if (!token) return ''
  const kind = parseGrabEcoCutleryKind(token)
  return kind ? GRAB_ECO_CUTLERY_RECEIPT_PRINT_EN[kind] : ''
}

export function resolveGrabEcoCutleryReceiptPrintLabelFromItems(
  items: Array<{ note?: string | null | undefined }>
): string {
  return resolveGrabEcoCutleryReceiptPrintLabel(findGrabEcoCutleryNoteTokenInItems(items))
}

export const GRAB_ECO_CUTLERY_RECEIPT_PRINT_CSS =
  '.receipt-eco-cutlery{margin:3mm 0 2mm;padding:2.5mm 1.5mm;border:2px solid #000;text-align:center;font-weight:800;font-size:14px;line-height:1.25;letter-spacing:.06em}'

export function buildGrabEcoCutleryReceiptPrintHtml(
  label: string,
  esc: (s: string) => string
): string {
  const text = String(label ?? '').trim()
  if (!text) return ''
  return `<div class="receipt-eco-cutlery">${esc(text)}</div>`
}

export function buildGrabEcoCutleryReceiptPrintSimpleRowHtml(
  label: string,
  esc: (s: string) => string
): string {
  const text = String(label ?? '').trim()
  if (!text) return ''
  return `<tr><td class="simple-eco-cutlery" colspan="2">${esc(text)}</td></tr>`
}

export const GRAB_ECO_CUTLERY_RECEIPT_SIMPLE_CSS =
  '.simple-eco-cutlery{margin:2mm 0;padding:2.5mm 1mm;border:2px solid #000;text-align:center;font-weight:800;font-size:14px;line-height:1.25;letter-spacing:.06em}'

/** `eco:plastic cutlery requested` 등 저장 청크 → requested / not_requested */
export function parseGrabEcoCutleryKind(chunk: string): GrabEcoCutleryKind | null {
  const s = String(chunk ?? '').trim().toLowerCase()
  if (!/^eco:/.test(s)) return null
  if (
    /\bno\b/.test(s) &&
    (s.includes('plastic') || s.includes('cutlery') || s.includes('utensil'))
  ) {
    return 'not_requested'
  }
  if (s.includes('plastic') || s.includes('cutlery') || s.includes('utensil')) {
    return 'requested'
  }
  return null
}

/** POS UI 언어로 1회용 선택 문구 표시 (i18n 키: posGrabEcoCutlery*) */
export function translateGrabEcoCutleryChunk(
  chunk: string,
  t?: (key: string) => string
): string {
  const raw = String(chunk ?? '').trim()
  if (!raw) return ''
  const kind = parseGrabEcoCutleryKind(raw)
  if (!kind) return raw
  if (!t) return GRAB_ECO_CUTLERY_FALLBACK_EN[kind]
  const key = GRAB_ECO_CUTLERY_I18N_KEY[kind]
  const value = t(key)
  return value && value !== key ? value : GRAB_ECO_CUTLERY_FALLBACK_EN[kind]
}

/** 요청사항 `·` 연결 문자열에서 eco 청크만 번역 */
export function translateGrabRequestSummaryChunks(
  summary: string,
  t?: (key: string) => string
): string {
  const text = String(summary ?? '').trim()
  if (!text || !t) return text
  return text
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => (isGrabEcoCutleryNoteChunk(chunk) ? translateGrabEcoCutleryChunk(chunk, t) : chunk))
    .join(' · ')
}

/** `·`로 이어진 요청/메모에서 eco: 청크만 제거 (주방 인쇄용) */
export function omitGrabEcoFromJoinedNote(text: string): string {
  return String(text ?? '')
    .split('·')
    .map((s) => s.trim())
    .filter((c) => c && !isGrabEcoCutleryNoteChunk(c))
    .join(' · ')
}

/** Grab 인쇄: 고객 요청문만(Item: 한 줄). 옵션 칩은 collectGrabPrintOptionLines 사용 */
export function resolveGrabPrintNoteRequest(
  rawNote: string | null | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>,
  t?: (key: string) => string
): string {
  const map = toOptionNameByCodeMap(optionNameByCode)
  const summary = String(resolveGrabDeliveryLineNote(rawNote, map).requestSummary ?? '').trim()
  return translateGrabRequestSummaryChunks(summary, t)
}

/** 영수증 메모: 수저·포크 체크리스트는 별도 줄 — eco 제외 */
export function resolveGrabPrintNoteRequestWithoutEco(
  rawNote: string | null | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>,
  t?: (key: string) => string
): string {
  const map = toOptionNameByCodeMap(optionNameByCode)
  const summary = omitGrabEcoFromJoinedNote(
    String(resolveGrabDeliveryLineNote(rawNote, map).requestSummary ?? '').trim()
  )
  return translateGrabRequestSummaryChunks(summary, t)
}

/** 주방 슬립·주방 줄 메모: 옵션 + 고객 요청(1회용 eco: 제외). 반반 `banbanFlavors:` 토큰은 HTML 단계 맛 복원용으로 유지 */
export function formatGrabLineNoteForKitchenPrint(
  rawNote: string | null | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const raw = String(rawNote ?? '').trim()
  if (!raw) return ''
  const chunks = raw
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  const banbanFlavorsChunk = chunks.find((chunk) => /^banbanFlavors:/i.test(chunk)) ?? ''
  const workNote = chunks
    .filter((chunk) => !/^banbanFlavors:/i.test(chunk) && !/^eco:/i.test(chunk))
    .join(' · ')
  const map = toOptionNameByCodeMap(optionNameByCode)
  const hasGrabOptionToken = /(?:^|[\s·,])[A-Za-z][A-Za-z0-9]*-\d+/.test(workNote)
  const shouldUseGrabParser = /(?:^|\s)(mods?:|optc:)/i.test(workNote) || hasGrabOptionToken
  let body = ''
  if (!workNote) {
    body = ''
  } else if (!shouldUseGrabParser) {
    body = normalizePosLineNote(workNote, { keepOptionSummary: false })
  } else {
    const grabMeta = resolveGrabDeliveryLineNote(workNote, map)
    const option = String(grabMeta.optionSummary || '').trim()
    const request = omitGrabEcoFromJoinedNote(String(grabMeta.requestSummary || ''))
    body =
      option || request
        ? [option, request].filter(Boolean).join(' · ')
        : normalizePosLineNote(workNote, { keepOptionSummary: false })
  }
  if (banbanFlavorsChunk) {
    return body ? `${body} · ${banbanFlavorsChunk}` : banbanFlavorsChunk
  }
  return body
}

function normalizeGrabPrintNameKey(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\[\]()]/g, '')
    .trim()
}

/** 부모 줄명과 구성 메뉴명이 같을 때(반반 등) 옵션만 줄로 — Grab 인쇄 전용 */
export function shouldGrabPromoComposeOptionOnly(
  parentItemName: string | undefined,
  composeMenuName: string
): boolean {
  const parentKey = normalizeGrabPrintNameKey(parentItemName ?? '')
  const menuKey = normalizeGrabPrintNameKey(composeMenuName)
  if (!parentKey || !menuKey) return false
  return parentKey === menuKey || parentKey.includes(menuKey) || menuKey.includes(parentKey)
}

/** Grab 치킨 사이즈·파트 라벨 (사이드·음료 제외) */
export function isGrabExplicitSizeOrPartLabel(raw: string): boolean {
  const lab = String(raw ?? '').trim()
  if (!lab) return false
  return (
    /^(?:size\s*)?(?:xxl|xl|l|m|s)\b/i.test(lab) ||
    /\b(size|part|boneless|drumette|joint wing|wing|leg|순살|뼈|โดบา|ปีก)\b/i.test(lab)
  )
}

function resolveOptionLabelFromCatalogMap(optionNameByCode: Map<string, string>, code: string): string {
  const key = String(code || '').trim().toUpperCase()
  if (!key) return ''
  const exact = optionNameByCode.get(key)
  if (exact) return String(exact).trim()
  for (const [k, v] of optionNameByCode.entries()) {
    if (String(k || '').trim().toUpperCase() === key) return String(v || '').trim()
  }
  return ''
}

/**
 * Grab 줄에 사이즈·파트가 이미 있는지 (사이드만 선택한 경우 false — 기본 S 순살 추론 허용).
 */
export function grabSelectionIncludesExplicitSize(params: {
  labels: string[]
  optionCodes: string[]
  optionNameByCode: Map<string, string>
}): boolean {
  for (const token of params.labels) {
    const t = String(token || '').trim()
    if (!t) continue
    if (/(^|[\s\-–—])(size\s*)?[SML]([\s\-–—]|$)/i.test(t)) return true
    if (isGrabExplicitSizeOrPartLabel(t)) return true
  }
  for (const code of params.optionCodes) {
    const label = resolveOptionLabelFromCatalogMap(params.optionNameByCode, code)
    if (!label) continue
    if (/(^|[\s\-–—])(size\s*)?[SML]([\s\-–—]|$)/i.test(label)) return true
    if (isGrabExplicitSizeOrPartLabel(label)) return true
  }
  return false
}

/** Grab 세트 구성품: 메뉴에 S 사이즈만 있으면 기본 Size S (캐셔·주방 공통) */
export function inferGrabPromoDefaultSizeLabel(
  menuId: string | undefined,
  menuCodeByMenuId: Record<string, string> | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>
): string {
  const map = toOptionNameByCodeMap(optionNameByCode)
  const mid = String(menuId ?? '').trim()
  const menuCode =
    mid && menuCodeByMenuId ? String(menuCodeByMenuId[mid] ?? '').trim().toUpperCase() : ''
  if (!menuCode) return ''
  const labels: string[] = []
  for (const [code, label] of map.entries()) {
    const key = String(code).trim().toUpperCase()
    if (!key.startsWith(`${menuCode}-`)) continue
    const text = String(label ?? '').trim()
    if (text) labels.push(text)
  }
  if (labels.length === 0) return ''
  const hasMOrL = labels.some(
    (lab) =>
      /(^|[\s\-–—])(size\s*)?(m|l)([\s\-–—]|$)/i.test(lab) || /\bsize\s*(m|l)\b/i.test(lab)
  )
  if (!hasMOrL) return ''
  return labels.find((lab) => /(^|[\s\-–—])(size\s*)?s([\s\-–—]|$)/i.test(lab)) || 'Size S'
}

export type GrabPromoPrintRow = {
  menuId: string
  optionId?: string | null
  optionCode?: string | null
  optionName?: string | null
  menuName?: string
  quantity: number
}

/** GrabPosCatalog → 주방·영수증 보강용 menuId→code 맵 */
export function buildMenuCodeByMenuIdFromGrabCatalog(catalog: GrabPosCatalog): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of catalog.menuById.values()) {
    const id = String(entry.id ?? '').trim()
    const code = String(entry.code ?? '').trim()
    if (id && code) out[id] = code
  }
  return out
}

/** Grab 주문 수신·인쇄: promoItems 스냅샷에 기본 S 순살 등 사이즈 보강 */
export function enrichGrabPromoItemsWithDefaultSizeFromCatalog<T extends GrabPromoPrintRow>(
  items: T[] | undefined,
  catalog: GrabPosCatalog
): T[] | undefined {
  if (!items?.length) return items
  return enrichGrabPromoItemsForPrint(items, {
    optionNameByCode: catalog.optionNameByCode,
    menuCodeByMenuId: buildMenuCodeByMenuIdFromGrabCatalog(catalog),
  })
}

/** Grab 영수증·주방: promoItems 에 사이즈·옵션명 보강 */
export function enrichGrabPromoItemsForPrint<T extends GrabPromoPrintRow>(
  items: T[],
  opts?: {
    optionNameByCode?: Map<string, string> | Record<string, string>
    menuCodeByMenuId?: Record<string, string>
  }
): T[] {
  const map = toOptionNameByCodeMap(opts?.optionNameByCode)
  return items.map((p) => {
    let optionName = String(p.optionName ?? '').trim()
    const optionCode = String(p.optionCode ?? '').trim()
    if (!optionName && optionCode) {
      const fromCode = formatGrabOrderLineNoteForPrint(`optc:${optionCode}`, map)
      if (fromCode && !fromCode.split(',').every((x) => isLikelyPosOptionCode(x.trim()))) {
        optionName = fromCode
      } else {
        const direct = map.get(optionCode.toUpperCase())
        if (direct) optionName = String(direct).trim()
      }
    }
    if (!optionName) {
      const inferred = inferGrabPromoDefaultSizeLabel(p.menuId, opts?.menuCodeByMenuId, map)
      if (inferred) optionName = inferred
    }
    return optionName ? ({ ...p, optionName } as T) : p
  })
}

/** 세트·반반 compose 옵션: 콤마 또는 `/`(2맛)로 분리 */
function splitPromoOptionNameParts(optName: string): string[] {
  const text = String(optName ?? '').trim()
  if (!text) return []
  const slashParts = text
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (slashParts.length === 2) return slashParts
  const commaParts = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (commaParts.length > 1) return commaParts
  return [text]
}

/** 세트 구성 줄: Grab일 때 옵션(사이즈 등)을 항목별로 분리 */
export function formatGrabPromoComposeLinesForPrint(
  p: {
    menuName: string
    optionName?: string
    quantity: number
    /** 세트 헤더·반반 부모명 — 같으면 옵션만 출력 */
    parentItemName?: string
  },
  grabSplit: boolean
): string[] {
  const menuName = String(p.menuName ?? '').trim()
  const qty = Math.max(1, Number(p.quantity) || 1)
  const optName = String(p.optionName ?? '').trim()
  const optionParts = splitPromoOptionNameParts(optName)
  // 사이즈·파트(예: "Size S", "M - Boneless")는 메뉴명 없이 단독으로는 주방에서 의미가 없다.
  // 세트명이 메뉴명을 부분 포함하는 경우(예: "Set 1 Golden Fried Chicken" ⊃ "GOLDEN FRIED CHICKEN")
  // 메뉴명을 지우면 "Size S"만 남아 어떤 치킨인지 알 수 없으므로, 사이즈·파트 옵션은 메뉴명을 유지한다.
  // (반반 맛처럼 그 자체가 메뉴를 설명하는 옵션은 기존대로 옵션만 출력한다.)
  const optionIsSizeOrPart =
    isGrabExplicitSizeOrPartLabel(optName) || optionParts.some((part) => isGrabExplicitSizeOrPartLabel(part))
  const optionOnly =
    optName &&
    !optionIsSizeOrPart &&
    shouldGrabPromoComposeOptionOnly(p.parentItemName, menuName) &&
    (grabSplit || optionParts.length > 1)

  if (!optName) return [`${menuName} x${qty}`]

  if (optionOnly) {
    const parts = optionParts
    if (parts.length <= 1) return [`${optName} x${qty}`]
    return parts.map((part) => `${part} x${qty}`)
  }

  if (!grabSplit) return [`${menuName} (${optName}) x${qty}`]
  const parts = optionParts
  if (parts.length <= 1) return [`${menuName} (${optName}) x${qty}`]
  return parts.map((part) => `${menuName} (${part}) x${qty}`)
}

/** 영수증·주방 인쇄: Grab 줄 note(optc/mods/코드 나열)를 사람이 읽는 옵션 문구로 */
export function formatGrabOrderLineNoteForPrint(
  rawNote: string | null | undefined,
  optionNameByCode?: Map<string, string> | Record<string, string>,
  t?: (key: string) => string
): string {
  const raw = String(rawNote ?? '').trim()
  if (!raw) return ''
  const map = toOptionNameByCodeMap(optionNameByCode)
  const hasGrabOptionToken = /(?:^|[\s·,])[A-Za-z0-9][A-Za-z0-9]*-\d+/.test(raw)
  const shouldUseGrabParser = /(?:^|\s)(mods?:|optc:)/i.test(raw) || hasGrabOptionToken
  if (!shouldUseGrabParser) return normalizePosLineNote(raw, { keepOptionSummary: false })
  const grabMeta = resolveGrabDeliveryLineNote(raw, map)
  const option = String(grabMeta.optionSummary || '').trim()
  const request = translateGrabRequestSummaryChunks(String(grabMeta.requestSummary || '').trim(), t)
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
  if (!/[A-Za-z0-9][A-Za-z0-9]*-\d+/.test(text) && !/(?:^|\s)(mods?:|optc:)/i.test(text)) {
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

function collectGrabItemOptionCodeFields(item: {
  optionCode?: string | null
  optionCode1?: string | null
  optionCode2?: string | null
  optionCodes?: string[] | null
}): string[] {
  const out = new Set<string>()
  for (const raw of [
    item.optionCode,
    item.optionCode1,
    item.optionCode2,
    ...(Array.isArray(item.optionCodes) ? item.optionCodes : []),
  ]) {
    const token = String(raw ?? '').trim()
    if (!token) continue
    const parts = token.includes('+')
      ? token.split('+').map((part) => part.trim()).filter(Boolean)
      : [token]
    for (const code of parts) {
      const upper = code.toUpperCase()
      if (upper) out.add(upper)
    }
  }
  return Array.from(out)
}

/**
 * Grab 줄 note 단일 소스: DB note + optionCode(s) 필드를 `optc:` 코드로 병합.
 * 인쇄(홀·주방·결제) 직전에 호출하고, note 를 사람이 읽는 문장으로 미리 바꾸지 않는다.
 */
export function resolveGrabItemPrintNote(item: {
  note?: string | null
  optionCode?: string | null
  optionCode1?: string | null
  optionCode2?: string | null
  optionCodes?: string[] | null
}): string {
  const existing = String(item.note ?? '').trim()
  const fieldCodes = collectGrabItemOptionCodeFields(item)
  const noteCodes = parseOptcCodesFromNote(existing).map((c) => c.toUpperCase())
  const mergedCodes = new Set<string>([...noteCodes, ...fieldCodes])
  if (mergedCodes.size === 0) return existing

  const mergedOptc = `optc:${Array.from(mergedCodes).join(',')}`
  if (!existing) return mergedOptc

  const chunks = existing
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  const withoutOptc = chunks.filter((c) => !/^optc:/i.test(c))
  withoutOptc.push(mergedOptc)
  return withoutOptc.join(' · ')
}

/** @deprecated resolveGrabItemPrintNote 사용 */
export function synthesizeGrabItemOptionNote(item: {
  note?: string | null
  optionCode?: string | null
  optionCode1?: string | null
  optionCode2?: string | null
  optionCodes?: string[] | null
}): string {
  return resolveGrabItemPrintNote(item)
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
    const codeKey = raw.toUpperCase()
    let mappedAny = false
    for (const label of resolveOptionCodesToLabels([raw], optionNameByCode)) {
      if (label && label.toUpperCase() !== codeKey) {
        pushHumanOption(label)
        mappedAny = true
      }
    }
    if (isLikelyPosOptionCode(raw)) {
      if (mappedAny) return
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
    if (/^banbanFlavors:/i.test(chunk)) continue
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

/** 메뉴에 S·M/L 옵션만 있을 때 기본 S 라벨 추론(Grab 세트 구성·주방 프로모 표기) */
export function inferDefaultSizeLabelForMenuId(
  menuIdRaw: string | null | undefined,
  menuCodeById: Map<string, string>,
  optionNameByCode: Map<string, string>
): string {
  const menuId = String(menuIdRaw ?? '').trim()
  if (!menuId) return ''
  const menuCode = String(menuCodeById.get(menuId) ?? '').trim().toUpperCase()
  if (!menuCode) return ''
  const labels: string[] = []
  for (const [code, label] of optionNameByCode.entries()) {
    const key = String(code ?? '').trim().toUpperCase()
    if (!key.startsWith(`${menuCode}-`)) continue
    const text = String(label ?? '').trim()
    if (text) labels.push(text)
  }
  if (labels.length === 0) return ''
  const hasMOrL = labels.some(
    (lab) =>
      /(^|[\s\-–—])(size\s*)?(m|l)([\s\-–—]|$)/i.test(lab) || /\bsize\s*(m|l)\b/i.test(lab)
  )
  if (!hasMOrL) return ''
  return labels.find((lab) => /(^|[\s\-–—])(size\s*)?s([\s\-–—]|$)/i.test(lab)) || 'Size S'
}
