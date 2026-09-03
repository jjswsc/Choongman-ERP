/**
 * QR 손님 화면용 메뉴명·설명.
 * 메뉴명·카테고리는 POS 원문 유지. 설명만 언어별 입력문이 있으면 그 언어로 보여 준다.
 */

export type PosMenuGuestI18nMap = Partial<Record<string, string>>

function langKey(lang: string): string {
  return String(lang || 'th').trim().toLowerCase().slice(0, 2)
}

export function parsePosMenuI18nMap(raw: unknown): PosMenuGuestI18nMap {
  if (!raw) return {}
  let obj: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return {}
    try {
      obj = JSON.parse(s)
    } catch {
      return {}
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out: PosMenuGuestI18nMap = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = langKey(k)
    const text = String(v ?? '').trim()
    if (key && text) out[key] = text
  }
  return out
}

function pickMap(map: PosMenuGuestI18nMap | undefined, lang: string): string {
  if (!map) return ''
  return String(map[langKey(lang)] || '').trim()
}

/** 메뉴명·옵션·카테고리: 자동 번역하지 않고 POS 원문. */
export function resolvePosMenuGuestLabel(raw: string): string {
  return String(raw || '').trim()
}

export function resolvePosMenuGuestName(input: { name: string; nameI18n?: PosMenuGuestI18nMap | null; lang?: string }): string {
  return resolvePosMenuGuestLabel(input.name)
}

/**
 * 설명만 언어를 탄다.
 * 해당 언어 설명이 있으면 그걸 쓰고, 없으면 테이블오더/기본 설명 원문.
 */
export function resolvePosMenuGuestDescription(input: {
  description?: string | null
  descriptionDefault?: string | null
  descriptionI18n?: PosMenuGuestI18nMap | null
  lang: string
}): string {
  const mapped = pickMap(input.descriptionI18n || undefined, input.lang)
  if (mapped) return mapped
  return String(input.description || '').trim() || String(input.descriptionDefault || '').trim()
}

export function posMenuGuestSearchHaystack(input: {
  name: string
  description?: string
  category?: string
  categoryMain?: string
  nameI18n?: PosMenuGuestI18nMap | null
  descriptionI18n?: PosMenuGuestI18nMap | null
  lang: string
}): string {
  const desc = resolvePosMenuGuestDescription({
    description: input.description,
    descriptionI18n: input.descriptionI18n,
    lang: input.lang,
  })
  return [input.name, input.description, desc, input.category, input.categoryMain, ...Object.values(input.descriptionI18n || {})]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
