type AnyRow = Record<string, unknown>

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
