import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { allocateNextPosOrderNo } from '@/lib/pos-order-no-server'
import { computePosPricing } from '@/lib/pos-pricing'
import { consumeDeliveryMenuStockByName } from '@/lib/pos-delivery-policy'
import { buildGrabOrderMemo, mergeGrabStateIntoFullMemo } from '@/lib/grab-order-memo'
import { parseGrabStoreMap } from '@/lib/grab-store-map-env'

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
  note?: string
  deliveryAppCode?: string
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
    if (depth > 3 || value == null) continue
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
      for (const piece of pieces) {
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
  const mapped = map[partnerMerchantID] || map[merchantID] || ''
  return (
    normalizeStoreCodeCandidate(mapped) ||
    payloadDerived ||
    normalizeStoreCodeCandidate(partnerMerchantID) ||
    normalizeStoreCodeCandidate(merchantID) ||
    partnerMerchantID
  )
}

function resolveEcoCutlerySummary(order: Record<string, unknown>): string | null {
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
      const k = String(kRaw || '').trim().toLowerCase()
      if (!k) continue
      const isCutleryKey =
        (k.includes('plastic') && (k.includes('cutlery') || k.includes('utensil'))) ||
        k.includes('cutleryrequested') ||
        k.includes('utensilrequested')
      if (isCutleryKey) {
        if (typeof v === 'boolean') found = v
        else if (typeof v === 'string') {
          const s = v.trim().toLowerCase()
          if (s === 'true' || s === 'yes' || s === '1') found = true
          else if (s === 'false' || s === 'no' || s === '0') found = false
        } else {
          const n = Number(v)
          if (Number.isFinite(n)) found = n > 0
        }
      }
      if (v && typeof v === 'object') queue.push({ value: v, depth: depth + 1 })
    }
  }
  if (found == null) return null
  return found ? 'eco:plastic cutlery requested' : 'eco:no plastic cutlery requested'
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

async function buildPosItems(order: Record<string, unknown>): Promise<PosItem[]> {
  const exponent = currencyExponent(order)
  const rawItems = Array.isArray(order.items) ? order.items : []
  const ecoSummary = resolveEcoCutlerySummary(order)
  const menuNameById = await loadPosMenuNameById()
  const out: PosItem[] = []
  let idx = 0

  for (const raw of rawItems) {
    const item = asRecord(raw)
    const qty = Math.max(1, Math.trunc(toNumber(item.quantity) || 1))
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers : []
    let modifierMinor = 0
    const modifierNames: string[] = []
    const pricedModifierSignatures = new Set<string>()
    const pricedModifierFuzzySignatures = new Set<string>()
    for (const m of modifiers) {
      const mod = asRecord(m)
      const modQty = Math.max(1, Math.trunc(toNumber(mod.quantity) || 1))
      modifierMinor += toNumber(mod.price) * modQty
      pricedModifierSignatures.add(buildModifierPriceSignature(mod))
      pricedModifierFuzzySignatures.add(buildModifierFuzzySignature(mod))
      const names = extractReadableModifierNames(mod)
      for (const n of names) {
        if (!modifierNames.includes(n)) modifierNames.push(n)
      }
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
    }
    for (const n of extractReadableOptionsFromItemText(item)) {
      if (!modifierNames.includes(n)) modifierNames.push(n)
    }
    for (const n of extractReadableNamesFromMachineIds(item, menuNameById)) {
      if (!modifierNames.includes(n)) modifierNames.push(n)
    }
    const banbanSlots = extractBanbanSlotNumbersFromItem(item)
    if (banbanSlots.length > 0) {
      // 반반치킨은 영수증 길이 절감을 위해 선택 맛 이름 대신 슬롯 번호(1,2)만 표기
      modifierNames.length = 0
      for (const s of banbanSlots) modifierNames.push(s)
    }

    const unitBaseMinor = toNumber(item.price)
    const unitMinorByParts = unitBaseMinor + modifierMinor
    const lineMinor = readLineMinorTotal(item)
    const noteParts = [
      pickCustomerReadableText(
        item.specialRequest,
        item.specialInstruction,
        item.instructions,
        item.customerNote,
        item.specifications
      ),
      modifierNames.length ? `mods:${modifierNames.join(',')}` : '',
      ecoSummary || '',
    ].filter(Boolean)

    const itemBaseId = String(item.id ?? item.grabItemID ?? idx)
    const itemName = String(
      item.name ??
        item.title ??
        item.displayName ??
        item.itemName ??
        item.grabItemName ??
        item.grabItemID ??
        item.id ??
        `Grab item ${idx + 1}`
    )
    const itemNote = noteParts.length ? noteParts.join(' · ') : undefined

    const pushPosItem = (unitMinor: number, rowQty: number, rowSuffix: string) => {
      if (rowQty <= 0) return
      out.push({
        id: `grab:${itemBaseId}${rowSuffix}`,
        name: itemName,
        price: minorToMajor(unitMinor, exponent),
        qty: rowQty,
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
      pushPosItem(unitMinorByParts, qty, '')
    }
    idx += 1
  }

  return out
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
  const receiver = asRecord(order.receiver)
  const receiverName = String(receiver.name ?? '').trim()
  const fulfill = resolveFulfillmentLabel(order)
  if (short && receiverName) return `Grab #${short} · ${fulfill} · ${receiverName}`
  if (short) return `Grab #${short} · ${fulfill}`
  if (receiverName) return `Grab · ${fulfill} · ${receiverName}`
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

  const storeCode = resolveGrabStoreCode(order)
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
    `store_code=eq.${encodeURIComponent(storeCode)}&memo=ilike.${encodeURIComponent(`*grab_order:${orderID}*`)}`,
    { limit: 1, select: 'id,order_no' }
  )) as { id?: number; order_no?: string }[]
  if (existing?.[0]?.id) {
    return {
      ok: true,
      orderId: Number(existing[0].id),
      orderNo: String(existing[0].order_no ?? ''),
      duplicate: true,
      storeCode,
    }
  }

  const items = await buildPosItems(order)
  if (!items.length) return { ok: false, message: 'no line items' }

  let subtotal = 0
  for (const item of items) subtotal += item.price * item.qty

  const exponent = currencyExponent(order)
  const price = asRecord(order.price)
  const deliveryFee = minorToMajor(price.deliveryFee, exponent)
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
  const total = totalFromWebhook > 0 ? totalFromWebhook : pricing.finalTotal
  const vat = tax > 0 ? tax : pricing.vatFeeAmt
  const paymentCash = paymentType === 'CASH' ? total : 0
  const paymentDeliveryApp = paymentType === 'CASHLESS' ? total : 0

  const orderNo = await allocateNextPosOrderNo(storeCode)
  const row = {
    order_no: orderNo,
    store_code: storeCode,
    order_type: resolveOrderType(order),
    table_name: resolveDisplayName(order),
    memo,
    discount_amt: discountAmt,
    discount_reason: '',
    delivery_fee: deliveryFee,
    packaging_fee: packagingFee,
    items_json: JSON.stringify(items),
    subtotal,
    vat,
    total,
    status: initialStatus,
    payment_cash: paymentCash,
    payment_card: 0,
    payment_qr: 0,
    payment_other: 0,
    payment_delivery_app: paymentDeliveryApp,
    member_id: null,
    member_no: null,
    coupon_code: null,
    coupon_discount_amt: 0,
    point_used: 0,
    point_earned: 0,
    guest_count: 0,
    delivery_app_code: 'grab',
  }

  const inserted = (await supabaseInsert('pos_orders', row)) as { id?: number }[]
  const created = Array.isArray(inserted) ? inserted[0] : inserted
  if (!created?.id) return { ok: false, message: 'insert failed' }

  await consumeDeliveryMenuStockByName({
    storeCode,
    appCode: 'grab',
    items: items.map((item) => ({ name: item.name, qty: item.qty })),
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

  const memoIlike = `memo=ilike.${encodeURIComponent(`*grab_order:${orderID}*`)}`
  let rows = (await supabaseSelectFilter('pos_orders', memoIlike, {
    limit: 1,
    select: 'id,status,memo',
  })) as { id?: number; status?: string; memo?: string }[]

  if (!rows?.[0]?.id && params.orderPayload && typeof params.orderPayload === 'object') {
    const persisted = await persistGrabOrderToPos(params.orderPayload as Record<string, unknown>)
    if (!persisted.ok) {
      return { ok: false, message: `order_not_found_and_create_failed:${persisted.message}` }
    }
    rows = (await supabaseSelectFilter('pos_orders', `id=eq.${persisted.orderId}`, {
      limit: 1,
      select: 'id,status,memo',
    })) as { id?: number; status?: string; memo?: string }[]
  }

  const row = rows?.[0]
  if (!row?.id) return { ok: false, message: 'pos_order_not_found' }

  const prevMemo = String(row.memo ?? '')
  const mergedMemo = mergeGrabStateIntoFullMemo(prevMemo, orderID, incomingState)
  const memoChanged = mergedMemo !== prevMemo

  let statusUpdated = false
  const prevStatus = String(row.status ?? '').trim().toLowerCase()
  if (nextStatus && canApplyGrabStatusTransition(prevStatus, nextStatus)) {
    await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(row.id)}`, {
      status: nextStatus,
      ...(memoChanged ? { memo: mergedMemo } : {}),
    })
    statusUpdated = true
  } else if (memoChanged) {
    await supabaseUpdateByFilter('pos_orders', `id=eq.${Number(row.id)}`, { memo: mergedMemo })
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
