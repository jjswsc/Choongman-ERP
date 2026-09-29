import { splitPromoChoiceGroups, type PromoChoiceLine } from '@/lib/pos-promo-choice'

/** 손님 QR에 내려주는 세트 구성 한 줄 */
export type QrGuestPromoLine = {
  menuId: number
  menuName: string
  optionId: number | null
  optionName: string
  optionCode: string
  quantity: number
  choiceGroup: string | null
  choicePickCount: number | null
}

export type QrGuestPromoCompose = {
  id: string
  code: string
  lines: QrGuestPromoLine[]
}

export type QrPromoPick = {
  menuId: number
  optionId?: number | null
  quantity?: number
}

export type QrPromoOrderItem = {
  menuId: string
  optionId: string | null
  optionCode?: string
  optionName?: string
  menuName?: string
  quantity: number
}

type CatalogLine = PromoChoiceLine & {
  menuName: string
  optionName: string
  optionCode: string
}

function toCatalogLines(lines: QrGuestPromoLine[] | null | undefined): CatalogLine[] {
  const out: CatalogLine[] = []
  for (const line of lines || []) {
    const menuId = Math.floor(Number(line.menuId) || 0)
    if (!menuId) continue
    const optionIdNum = Math.floor(Number(line.optionId) || 0)
    out.push({
      menuId: String(menuId),
      optionId: optionIdNum > 0 ? String(optionIdNum) : null,
      quantity: Math.min(20, Math.max(1, Math.floor(Number(line.quantity) || 1))),
      choiceGroup: String(line.choiceGroup || '').trim() || null,
      choicePickCount:
        line.choicePickCount != null && Number.isFinite(Number(line.choicePickCount))
          ? Math.max(1, Math.floor(Number(line.choicePickCount)))
          : null,
      menuName: String(line.menuName || '').trim(),
      optionName: String(line.optionName || '').trim(),
      optionCode: String(line.optionCode || '').trim(),
    })
  }
  return out
}

export function parseQrPromoPicks(raw: unknown): QrPromoPick[] {
  if (!Array.isArray(raw)) return []
  const out: QrPromoPick[] = []
  for (const row of raw.slice(0, 24)) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { menuId?: unknown; optionId?: unknown; quantity?: unknown }
    const menuId = Math.floor(Number(rec.menuId) || 0)
    if (!menuId) continue
    const optionIdNum = Math.floor(Number(rec.optionId) || 0)
    const quantity = Math.min(20, Math.max(1, Math.floor(Number(rec.quantity) || 1)))
    out.push({
      menuId,
      optionId: optionIdNum > 0 ? optionIdNum : null,
      quantity,
    })
  }
  return out
}

export function qrPromoNeedsGuestChoice(lines: QrGuestPromoLine[] | null | undefined): boolean {
  const catalog = toCatalogLines(lines)
  if (!catalog.length) return false
  return splitPromoChoiceGroups(catalog).groups.length > 0
}

function pickMatchesLine(pick: QrPromoPick, line: CatalogLine): boolean {
  if (Math.floor(Number(pick.menuId) || 0) !== Math.floor(Number(line.menuId) || 0)) return false
  const lineOpt = Math.floor(Number(line.optionId) || 0)
  const pickOpt = Math.floor(Number(pick.optionId) || 0)
  if (lineOpt > 0 && pickOpt !== lineOpt) return false
  return true
}

function toOrderItem(line: CatalogLine): QrPromoOrderItem {
  return {
    menuId: line.menuId,
    optionId: line.optionId,
    ...(line.optionCode ? { optionCode: line.optionCode } : {}),
    ...(line.optionName ? { optionName: line.optionName } : {}),
    ...(line.menuName ? { menuName: line.menuName } : {}),
    quantity: line.quantity,
  }
}

export function formatQrPromoItemLabels(
  items: Array<{ menuName?: string | null; optionName?: string | null; quantity?: number | null }> | null | undefined
): string {
  const parts: string[] = []
  for (const item of items || []) {
    const name = String(item.menuName || '').trim()
    if (!name) continue
    const opt = String(item.optionName || '').trim()
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1))
    const label = opt ? `${name} (${opt})` : name
    parts.push(qty > 1 ? `${label} x${qty}` : label)
  }
  return parts.join(' · ')
}

/**
 * 세트 미러 메뉴 주문 줄에 붙일 promoItems.
 * 고정 구성은 그대로 넣고, 선택 그룹은 손님이 고른 줄만 넣는다.
 */
export function resolveQrSetOrderSnapshot(params: {
  promoId: string
  promoCode?: string | null
  lines: QrGuestPromoLine[] | null | undefined
  picks?: QrPromoPick[] | null
}):
  | { ok: true; promoId: string; promoCode?: string; promoItems: QrPromoOrderItem[] }
  | { ok: false; error: 'promo_choice_required' } {
  const promoId = String(params.promoId || '').trim()
  const catalog = toCatalogLines(params.lines)
  if (!promoId || promoId === '0' || !catalog.length) {
    return { ok: true, promoId, promoItems: [] }
  }
  const { groups } = splitPromoChoiceGroups(catalog)
  const catalogByRowKey = new Map<string, CatalogLine>()
  catalog.forEach((line, idx) => {
    catalogByRowKey.set(`${idx}:${line.menuId}:${line.optionCode}:${line.optionId ?? ''}`, line)
  })
  const promoItems = catalog
    .filter((line) => !String(line.choiceGroup || '').trim())
    .map(toOrderItem)
  if (groups.length === 0) {
    const promoCode = String(params.promoCode || '').trim()
    return {
      ok: true,
      promoId,
      ...(promoCode ? { promoCode } : {}),
      promoItems,
    }
  }
  const unused = parseQrPromoPicks(params.picks)
  if (!unused.length) return { ok: false, error: 'promo_choice_required' }
  for (const group of groups) {
    const chosen: CatalogLine[] = []
    for (const row of group.lines) {
      const source = catalogByRowKey.get(row.rowKey)
      if (!source) continue
      if (chosen.length >= group.pickCount) break
      const idx = unused.findIndex((pick) => pickMatchesLine(pick, source))
      if (idx < 0) continue
      unused.splice(idx, 1)
      chosen.push(source)
    }
    if (chosen.length !== group.pickCount) return { ok: false, error: 'promo_choice_required' }
    promoItems.push(...chosen.map(toOrderItem))
  }
  const promoCode = String(params.promoCode || '').trim()
  return {
    ok: true,
    promoId,
    ...(promoCode ? { promoCode } : {}),
    promoItems,
  }
}

export function formatQrPromoSelectionSummary(
  lines: QrGuestPromoLine[] | null | undefined,
  picks?: QrPromoPick[] | null
): string {
  const resolved = resolveQrSetOrderSnapshot({
    promoId: 'preview',
    lines,
    picks,
  })
  if (!resolved.ok) {
    const fixed = (lines || []).filter((line) => !String(line.choiceGroup || '').trim())
    return formatQrPromoItemLabels(fixed)
  }
  return formatQrPromoItemLabels(resolved.promoItems)
}

export function formatQrOrderPromoDetail(promoItems: unknown): string {
  if (!Array.isArray(promoItems)) return ''
  return formatQrPromoItemLabels(
    promoItems.map((row) => {
      const rec = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      return {
        menuName: rec.menuName != null ? String(rec.menuName) : '',
        optionName: rec.optionName != null ? String(rec.optionName) : '',
        quantity: Number(rec.quantity ?? rec.qty ?? 1) || 1,
      }
    })
  )
}
