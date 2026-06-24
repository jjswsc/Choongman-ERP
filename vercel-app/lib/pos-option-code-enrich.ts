import { supabaseSelectFilter } from '@/lib/supabase-server'

type AnyRow = Record<string, unknown>

function pickNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim()
    if (s) return s
  }
  return ''
}

function pickOptionId(row: AnyRow): string {
  return pickNonEmptyString(row.optionId1, row.option_id1, row.optionId, row.option_id)
}

function hasOptionCode(row: AnyRow): boolean {
  return !!pickNonEmptyString(row.optionCode1, row.option_code1, row.optionCode, row.option_code)
}

function parsePositiveIntId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

function optionCodeFromPromoRow(row: AnyRow): string {
  return pickNonEmptyString(row.optionCode, row.option_code)
}

function optionIdFromPromoRow(row: AnyRow): string {
  return pickNonEmptyString(row.optionId, row.option_id)
}

/** `C023-1+C023-3` 등 다단계 합성 옵션 코드 분리 */
export function expandCombinedPosOptionCodeToken(raw: string): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  if (s.includes('+')) {
    return s
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return [s]
}

export function flattenPosOrderItemOptionCodes(row: Record<string, unknown>): string[] {
  const out = new Set<string>()
  const keys = [
    'optionCodes',
    'option_codes',
    'optionCode',
    'option_code',
    'optionCode1',
    'option_code1',
    'optionCode2',
    'option_code2',
  ] as const
  for (const key of keys) {
    const val = row[key]
    if (Array.isArray(val)) {
      for (const entry of val) {
        for (const code of expandCombinedPosOptionCodeToken(String(entry ?? ''))) {
          out.add(code.toUpperCase())
        }
      }
      continue
    }
    for (const code of expandCombinedPosOptionCodeToken(String(val ?? ''))) {
      out.add(code.toUpperCase())
    }
  }
  return [...out]
}

/** 회원앱 픽업 줄 → POS `items_json` 표준 필드(menuId1·optionCodes 등) */
export function normalizeMemberPortalPickupItemForPosSave(item: {
  menuId: string
  optionId?: string
  optionCode?: string
  code?: string | number
  name: string
  price: number
  qty: number
  optionCodes?: string[]
}): Record<string, unknown> {
  const menuId = String(item.menuId || '').trim()
  const optionIdRaw = String(item.optionId || '').trim()
  const optionCodes = flattenPosOrderItemOptionCodes({
    optionCode: String(item.optionCode || item.code || '').trim(),
    ...(Array.isArray(item.optionCodes) ? { optionCodes: item.optionCodes } : {}),
  })
  const optionId1 = /^\d+$/.test(optionIdRaw) ? optionIdRaw : undefined
  const name = String(item.name || '').trim()
  const qty = Math.max(1, Math.trunc(Number(item.qty || 1)))
  const price = Math.max(0, Number(item.price || 0))
  const lineId = `${menuId}-${optionIdRaw || optionCodes.join('+') || 'base'}`
  return {
    id: lineId,
    menuId1: menuId,
    menuId,
    name,
    price,
    qty,
    quantity: qty,
    ...(optionId1 ? { optionId1, optionId: optionId1 } : {}),
    ...(optionCodes[0] ? { optionCode1: optionCodes[0], optionCode: optionCodes[0], code: optionCodes[0] } : {}),
    ...(optionCodes[1] ? { optionCode2: optionCodes[1] } : {}),
    ...(optionCodes.length > 0 ? { optionCodes } : {}),
  }
}

function applyPosOrderItemOptionCodeFields(row: AnyRow): AnyRow {
  const codes = flattenPosOrderItemOptionCodes(row)
  const next: AnyRow = { ...row }
  const menuId = pickNonEmptyString(row.menuId1, row.menu_id1, row.menuId, row.menu_id)
  if (menuId) {
    next.menuId1 = menuId
    next.menuId = menuId
  }
  if (codes.length === 0) return next
  next.optionCodes = codes
  next.optionCode1 = codes[0]
  next.optionCode = codes[0]
  if (codes[1]) next.optionCode2 = codes[1]
  return next
}

export async function enrichOrderItemsWithOptionCode<T = unknown>(items: T[]): Promise<T[]> {
  const rows = (Array.isArray(items) ? items : []) as unknown[]
  if (rows.length === 0) return items
  const normalizedRows = rows.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw
    return applyPosOrderItemOptionCodeFields(raw as AnyRow)
  })

  const ids = new Set<number>()
  for (const raw of normalizedRows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as AnyRow
    if (!hasOptionCode(row)) {
      const oid = parsePositiveIntId(pickOptionId(row))
      if (oid) ids.add(oid)
    }
    const promoList = Array.isArray(row.promoItems)
      ? row.promoItems
      : Array.isArray(row.promo_items)
        ? row.promo_items
        : []
    for (const p of promoList) {
      if (!p || typeof p !== 'object') continue
      const prow = p as AnyRow
      if (optionCodeFromPromoRow(prow)) continue
      const oid = parsePositiveIntId(optionIdFromPromoRow(prow))
      if (oid) ids.add(oid)
    }
  }

  if (ids.size === 0) return items

  const idList = Array.from(ids.values()).sort((a, b) => a - b)
  const codeById = new Map<number, string>()
  const chunkSize = 300
  for (let i = 0; i < idList.length; i += chunkSize) {
    const chunk = idList.slice(i, i + chunkSize)
    try {
      const filter = `id=in.(${chunk.join(',')})`
      const found = (await supabaseSelectFilter('pos_menu_options', filter, {
        limit: chunk.length,
        select: 'id,option_code',
      })) as { id?: number; option_code?: string | null }[] | null
      for (const row of found || []) {
        const id = Number(row.id || 0)
        const code = String(row.option_code ?? '').trim()
        if (!id || !code) continue
        codeById.set(id, code)
      }
    } catch {
      // 조회 실패 시 원본 유지
      return items
    }
  }

  if (codeById.size === 0) return items

  return normalizedRows.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw as T
    const row = raw as AnyRow
    const next: AnyRow = { ...row }

    if (!hasOptionCode(row)) {
      const oid = parsePositiveIntId(pickOptionId(row))
      const code = oid ? codeById.get(oid) : ''
      if (code) {
        if (pickNonEmptyString(row.optionId1, row.option_id1)) next.optionCode1 = code
        else if (pickNonEmptyString(row.optionId, row.option_id)) next.optionCode = code
      }
    }

    const sourcePromoKey = Array.isArray(row.promoItems)
      ? 'promoItems'
      : Array.isArray(row.promo_items)
        ? 'promo_items'
        : ''
    if (sourcePromoKey) {
      const promoList = (row[sourcePromoKey] as unknown[]).map((p) => {
        if (!p || typeof p !== 'object') return p
        const prow = p as AnyRow
        if (optionCodeFromPromoRow(prow)) return p
        const oid = parsePositiveIntId(optionIdFromPromoRow(prow))
        const code = oid ? codeById.get(oid) : ''
        if (!code) return p
        return { ...prow, optionCode: code }
      })
      next[sourcePromoKey] = promoList
    }

    return next as T
  }) as T[]
}
