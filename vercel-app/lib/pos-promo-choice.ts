export type PromoChoiceLine = {
  menuId: string
  optionId: string | null
  optionCode?: string | null
  quantity: number
  choiceGroup?: string | null
  choicePickCount?: number | null
}

export type PromoChoiceGroup = {
  key: string
  pickCount: number
  lines: Array<PromoChoiceLine & { rowKey: string }>
}

const SLOT_LABEL_MAP: Record<string, string> = {
  main: '메인',
  side: '사이드',
  drink: '음료',
  sauce: '소스',
}

const SLOT_I18N_KEYS: Record<string, string> = {
  main: 'posPromoChoiceSlotMain',
  side: 'posPromoChoiceSlotSide',
  drink: 'posPromoChoiceSlotDrink',
  sauce: 'posPromoChoiceSlotSauce',
}

/** Grab·배달앱 손님 UI — 태국 매장 기준 (i18n th 블록과 동일) */
const SLOT_LABEL_MAP_GRAB_TH: Record<string, string> = {
  main: 'เมนหลัก',
  side: 'เมนูเสริม',
  drink: 'เครื่องดื่ม',
  sauce: 'ซอส',
}

/** Grab modifierGroups 그룹명 — 표준 슬롯은 태국어, 커스텀 키는 그대로 */
export function getPromoChoiceSlotLabelForGrabDelivery(key: string): string {
  const normalized = String(key || '').trim().toLowerCase()
  const th = SLOT_LABEL_MAP_GRAB_TH[normalized]
  if (th) return th
  return String(key || '').trim()
}

/** 번들 슬롯 키(main/side/drink/sauce) 표시 — `t`가 있으면 i18n, 없으면 한글 폴백 후 raw key */
export function getPromoChoiceSlotLabel(key: string, t?: (k: string) => string): string {
  const normalized = String(key || '').trim().toLowerCase()
  const i18nKey = SLOT_I18N_KEYS[normalized]
  if (t && i18nKey) {
    const s = t(i18nKey)
    if (s && s !== i18nKey) return s
  }
  return SLOT_LABEL_MAP[normalized] || String(key || '').trim()
}

function normalizeGroupKey(raw: unknown): string {
  return String(raw ?? '').trim()
}

function normalizePickCount(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.max(1, Math.floor(n))
}

function buildRowKey(line: PromoChoiceLine, idx: number): string {
  return `${idx}:${String(line.menuId)}:${String(line.optionCode ?? '')}:${String(line.optionId ?? '')}`
}

export function splitPromoChoiceGroups(items: PromoChoiceLine[]): {
  fixedItems: PromoChoiceLine[]
  groups: PromoChoiceGroup[]
} {
  const fixedItems: PromoChoiceLine[] = []
  const groupsMap = new Map<string, PromoChoiceGroup>()

  items.forEach((line, idx) => {
    const groupKey = normalizeGroupKey(line.choiceGroup)
    if (!groupKey) {
      fixedItems.push(line)
      return
    }
    const row = { ...line, rowKey: buildRowKey(line, idx) }
    const pickCount = normalizePickCount(line.choicePickCount)
    const existing = groupsMap.get(groupKey)
    if (existing) {
      existing.lines.push(row)
      existing.pickCount = Math.max(existing.pickCount, pickCount)
      return
    }
    groupsMap.set(groupKey, {
      key: groupKey,
      pickCount,
      lines: [row],
    })
  })

  const groups = [...groupsMap.values()].map((g) => ({
    ...g,
    pickCount: Math.min(g.pickCount, g.lines.length),
  }))
  return { fixedItems, groups }
}

