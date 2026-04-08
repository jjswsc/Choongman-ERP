import type { PosMenuUpsertApiBody } from '@/lib/pos-menu-upsert-server'

/** 양식 1행(영문 키) — 엑셀에서 다른 언어로 바꾸지 말 것 */
export const POS_MENU_IMPORT_SHEET_HEADERS = [
  'code',
  'name',
  'category_main',
  'category',
  'price',
  'price_delivery',
  'image',
  'vat_included',
  'is_active',
  'sort_order',
  'option_selection_groups',
  'kitchen_printer',
  'cooking_time_min',
  'is_banban',
  'id',
] as const

const HEADER_ALIASES: Record<string, string> = {
  코드: 'code',
  메뉴코드: 'code',
  메뉴명: 'name',
  이름: 'name',
  대분류: 'category_main',
  소분류: 'category',
  카테고리: 'category',
  홀가격: 'price',
  홀: 'price',
  배달가격: 'price_delivery',
  배달: 'price_delivery',
  이미지: 'image',
  이미지url: 'image',
  부가세포함: 'vat_included',
  판매: 'is_active',
  활성: 'is_active',
  정렬: 'sort_order',
  정렬순서: 'sort_order',
  옵션단계: 'option_selection_groups',
  옵션선택그룹: 'option_selection_groups',
  주방프린터: 'kitchen_printer',
  조리시간: 'cooking_time_min',
  조리시간분: 'cooking_time_min',
  반반: 'is_banban',
}

function normalizeHeaderKey(raw: string): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\uFEFF/g, '')
  if (!s) return ''
  const lower = s.toLowerCase().replace(/\s+/g, '_')
  if (POS_MENU_IMPORT_SHEET_HEADERS.includes(lower as (typeof POS_MENU_IMPORT_SHEET_HEADERS)[number])) {
    return lower
  }
  const ko = HEADER_ALIASES[s] ?? HEADER_ALIASES[s.replace(/\s/g, '')]
  if (ko) return ko
  return lower
}

function parseBool(v: unknown, defaultVal: boolean): boolean {
  if (v === '' || v == null) return defaultVal
  const s = String(v).trim().toLowerCase()
  if (['0', 'false', 'n', 'no', 'off', 'f', '아니오', '아니요', '否'].includes(s)) return false
  if (['1', 'true', 'y', 'yes', 'on', 't', '예', 'o', '是', 'v'].includes(s)) return true
  return defaultVal
}

function parseNum(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function parseOptionGroups(v: unknown): string[] | undefined {
  if (v === '' || v == null) return undefined
  const s = String(v).trim()
  if (!s) return undefined
  const parts = s.split(/[|｜,，;；\n\r]+/).map((x) => x.trim()).filter(Boolean)
  return parts.length ? Array.from(new Set(parts)) : undefined
}

function rowToBody(row: Record<string, unknown>): PosMenuUpsertApiBody | null {
  const o: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(row)) {
    const nk = normalizeHeaderKey(k)
    if (nk) o[nk] = val
  }
  const code = String(o.code ?? '').trim()
  const name = String(o.name ?? '').trim()
  if (!code && !name) return null
  const priceN = parseNum(o.price)
  const priceDeliveryN = parseNum(o.price_delivery)
  const sortN = parseNum(o.sort_order)
  const kp = parseNum(o.kitchen_printer)
  const ctm = parseNum(o.cooking_time_min)
  const idRaw = String(o.id ?? '').trim()
  const groups = parseOptionGroups(o.option_selection_groups)

  const body: PosMenuUpsertApiBody = {
    code,
    name,
    category: String(o.category ?? '').trim(),
    categoryMain: String(o.category_main ?? '').trim(),
    price: priceN ?? 0,
    priceDelivery: priceDeliveryN,
    imageUrl: String(o.image ?? '').trim(),
    vatIncluded: parseBool(o.vat_included, true),
    isActive: parseBool(o.is_active, true),
    sortOrder: sortN ?? 0,
    kitchenPrinter:
      kp === 0 || kp === 1 || kp === 2 || kp === 3 ? kp : null,
    cookingTimeMin: ctm != null && ctm >= 0 ? ctm : null,
    isBanban: parseBool(o.is_banban, false),
  }
  if (idRaw) body.id = idRaw
  if (groups !== undefined) body.optionSelectionGroups = groups
  return body
}

export async function parsePosMenuImportWorkbook(file: File): Promise<PosMenuUpsertApiBody[]> {
  const XLSX = await import('xlsx')
  const ab = await file.arrayBuffer()
  const wb = XLSX.read(ab, { type: 'array' })
  const name = wb.SheetNames[0]
  if (!name) return []
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  const out: PosMenuUpsertApiBody[] = []
  for (const row of rows) {
    const b = rowToBody(row)
    if (b) out.push(b)
  }
  return out
}

export async function buildPosMenuImportTemplateBlob(): Promise<Blob> {
  const XLSX = await import('xlsx')
  const header = [...POS_MENU_IMPORT_SHEET_HEADERS]
  const sample = [
    'c001',
    'Sample Fried',
    'Chicken',
    'Fried',
    15000,
    16000,
    '',
    1,
    1,
    0,
    'size|part',
    '',
    '',
    0,
    '',
  ]
  const ws = XLSX.utils.aoa_to_sheet([header, sample])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'menus')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
