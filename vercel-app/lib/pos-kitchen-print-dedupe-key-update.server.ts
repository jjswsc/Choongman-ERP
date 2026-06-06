import { createHash } from 'node:crypto'

type KitchenLineLike = {
  menuId?: unknown
  menu_id?: unknown
  menuId1?: unknown
  optionCode?: unknown
  option_code?: unknown
  name?: unknown
  price?: unknown
  qty?: unknown
  quantity?: unknown
  note?: unknown
}

function toIntId(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function toQty(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 1
}

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16)
}

function lineSignature(lineRaw: unknown): string {
  const line = (lineRaw ?? {}) as KitchenLineLike
  const menuId = String(line.menuId ?? line.menu_id ?? line.menuId1 ?? '').trim()
  const optionCode = String(line.optionCode ?? line.option_code ?? '').trim()
  const name = String(line.name ?? '').trim()
  const price = Number(line.price ?? 0) || 0
  const qty = toQty(line.qty ?? line.quantity)
  const note = String(line.note ?? '').trim()
  return [menuId, optionCode, name, price, qty, note].join('\u001f')
}

function linesHash(lines: unknown[]): string {
  if (!Array.isArray(lines) || lines.length === 0) return 'none'
  const signatures = lines.map((line) => lineSignature(line)).filter(Boolean)
  signatures.sort()
  return shortHash(signatures.join('\u001e'))
}

export function buildKitchenJobUpdateDedupeKey(orderIdRaw: unknown, lines: unknown[]): string {
  const orderId = toIntId(orderIdRaw)
  if (!orderId) return ''
  return `order:${orderId}:kitchen:update:${linesHash(lines)}`
}
