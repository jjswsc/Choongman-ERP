/**
 * QR 손님 화면용 메뉴명·설명·카테고리 표시.
 * 주방·POS 저장명은 영문 원문 유지. 손님이 고른 언어로만 바꿔 보여 준다.
 */

export type PosMenuGuestI18nMap = Partial<Record<string, string>>

const THAI_RE = /[\u0E00-\u0E7F]/

type TokenRule = { re: RegExp; to: string }

const NAME_TOKENS: Record<string, TokenRule[]> = {
  ko: [
    { re: /bar\.?\s*b\.?\s*q/gi, to: '바베큐' },
    { re: /fried chicken/gi, to: '후라이드 치킨' },
    { re: /soy sauce/gi, to: '간장' },
    { re: /guchujang|gochujang/gi, to: '고추장' },
    { re: /yangnyeom/gi, to: '양념' },
    { re: /tteokbokki/gi, to: '떡볶이' },
    { re: /dosirak/gi, to: '도시락' },
    { re: /banban/gi, to: '반반' },
    { re: /boneless/gi, to: '순살' },
    { re: /drumette/gi, to: '봉' },
    { re: /\bwings?\b/gi, to: '윙' },
    { re: /chicken/gi, to: '치킨' },
    { re: /garlic/gi, to: '갈릭' },
    { re: /curry/gi, to: '커리' },
    { re: /original/gi, to: '오리지널' },
    { re: /specialt(?:y|ies)/gi, to: '스페셜' },
    { re: /korean/gi, to: '한식' },
    { re: /drinks?/gi, to: '음료' },
    { re: /\bsides?\b/gi, to: '사이드' },
    { re: /salad/gi, to: '샐러드' },
    { re: /spicy/gi, to: '매운' },
    { re: /sweet/gi, to: '스위트' },
    { re: /honey/gi, to: '허니' },
    { re: /cheese/gi, to: '치즈' },
    { re: /kimchi/gi, to: '김치' },
    { re: /\brice\b/gi, to: '밥' },
    { re: /snow/gi, to: '스노우' },
  ],
  th: [
    { re: /bar\.?\s*b\.?\s*q/gi, to: 'บาร์บีคิว' },
    { re: /fried chicken/gi, to: 'ไก่ทอด' },
    { re: /soy sauce/gi, to: 'ซอสถั่วเหลือง' },
    { re: /guchujang|gochujang/gi, to: 'โกชูจัง' },
    { re: /yangnyeom/gi, to: 'ยังยอม' },
    { re: /tteokbokki/gi, to: 'ต็อกบกกี' },
    { re: /dosirak/gi, to: 'โดชิรัก' },
    { re: /banban/gi, to: 'บันบัน' },
    { re: /boneless/gi, to: 'ไม่มีกระดูก' },
    { re: /drumette/gi, to: 'น่องปีก' },
    { re: /\bwings?\b/gi, to: 'ปีก' },
    { re: /chicken/gi, to: 'ไก่' },
    { re: /garlic/gi, to: 'กระเทียม' },
    { re: /curry/gi, to: 'แกงกะหรี่' },
    { re: /original/gi, to: 'ออริจินัล' },
    { re: /specialt(?:y|ies)/gi, to: 'สเปเชียล' },
    { re: /korean/gi, to: 'เกาหลี' },
    { re: /drinks?/gi, to: 'เครื่องดื่ม' },
    { re: /\bsides?\b/gi, to: 'เครื่องเคียง' },
    { re: /salad/gi, to: 'สลัด' },
    { re: /spicy/gi, to: 'เผ็ด' },
    { re: /sweet/gi, to: 'หวาน' },
    { re: /honey/gi, to: 'น้ำผึ้ง' },
    { re: /cheese/gi, to: 'ชีส' },
    { re: /kimchi/gi, to: 'กิมจิ' },
    { re: /\brice\b/gi, to: 'ข้าว' },
    { re: /snow/gi, to: 'สโนว์' },
  ],
  zh: [
    { re: /bar\.?\s*b\.?\s*q/gi, to: '烧烤' },
    { re: /fried chicken/gi, to: '炸鸡' },
    { re: /soy sauce/gi, to: '酱油' },
    { re: /guchujang|gochujang/gi, to: '辣椒酱' },
    { re: /yangnyeom/gi, to: '韩式辣酱' },
    { re: /tteokbokki/gi, to: '炒年糕' },
    { re: /dosirak/gi, to: '便当' },
    { re: /banban/gi, to: '半半' },
    { re: /boneless/gi, to: '去骨' },
    { re: /drumette/gi, to: '翅根' },
    { re: /\bwings?\b/gi, to: '鸡翅' },
    { re: /chicken/gi, to: '鸡' },
    { re: /garlic/gi, to: '蒜香' },
    { re: /curry/gi, to: '咖喱' },
    { re: /original/gi, to: '原味' },
    { re: /korean/gi, to: '韩式' },
    { re: /drinks?/gi, to: '饮料' },
    { re: /\bsides?\b/gi, to: '配菜' },
    { re: /salad/gi, to: '沙拉' },
  ],
  ja: [
    { re: /bar\.?\s*b\.?\s*q/gi, to: 'バーベキュー' },
    { re: /fried chicken/gi, to: 'フライドチキン' },
    { re: /soy sauce/gi, to: '醤油' },
    { re: /guchujang|gochujang/gi, to: 'コチュジャン' },
    { re: /yangnyeom/gi, to: 'ヤンニョム' },
    { re: /tteokbokki/gi, to: 'トッポギ' },
    { re: /dosirak/gi, to: '弁当' },
    { re: /banban/gi, to: 'バンバン' },
    { re: /boneless/gi, to: '骨なし' },
    { re: /drumette/gi, to: 'ドラムレット' },
    { re: /\bwings?\b/gi, to: '手羽' },
    { re: /chicken/gi, to: 'チキン' },
    { re: /garlic/gi, to: 'ガーリック' },
    { re: /curry/gi, to: 'カレー' },
    { re: /original/gi, to: 'オリジナル' },
    { re: /korean/gi, to: '韓国' },
    { re: /drinks?/gi, to: 'ドリンク' },
    { re: /\bsides?\b/gi, to: 'サイド' },
  ],
  vi: [
    { re: /bar\.?\s*b\.?\s*q/gi, to: 'BBQ' },
    { re: /fried chicken/gi, to: 'gà rán' },
    { re: /soy sauce/gi, to: 'nước tương' },
    { re: /guchujang|gochujang/gi, to: 'tương ớt Hàn' },
    { re: /banban/gi, to: 'Banban' },
    { re: /chicken/gi, to: 'gà' },
    { re: /garlic/gi, to: 'tỏi' },
    { re: /curry/gi, to: 'cà ri' },
    { re: /drinks?/gi, to: 'đồ uống' },
  ],
}

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
  const key = langKey(lang)
  return String(map[key] || '').trim()
}

function applyNameTokens(text: string, lang: string): string {
  const rules = NAME_TOKENS[langKey(lang)]
  if (!rules?.length) return text
  let out = text
  for (const rule of rules) {
    out = out.replace(rule.re, rule.to)
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

/** 손님 언어로 메뉴·옵션·카테고리 한 줄 표시. 매핑이 있으면 그걸 쓰고, 없으면 흔한 영문 메뉴 단어를 바꾼다. */
export function resolvePosMenuGuestLabel(
  raw: string,
  lang: string,
  i18n?: PosMenuGuestI18nMap | null
): string {
  const src = String(raw || '').trim()
  if (!src) return ''
  const mapped = pickMap(i18n || undefined, lang)
  if (mapped) return mapped
  const key = langKey(lang)
  if (key === 'en') return src
  return applyNameTokens(src, key)
}

export function resolvePosMenuGuestName(input: {
  name: string
  nameI18n?: PosMenuGuestI18nMap | null
  lang: string
}): string {
  return resolvePosMenuGuestLabel(input.name, input.lang, input.nameI18n)
}

function descriptionOkForLang(text: string, lang: string): boolean {
  const s = text.trim()
  if (!s) return false
  const key = langKey(lang)
  if (key === 'th') return true
  if (THAI_RE.test(s)) return false
  if (key === 'ko') return true
  return true
}

export function resolvePosMenuGuestDescription(input: {
  description?: string | null
  descriptionDefault?: string | null
  descriptionI18n?: PosMenuGuestI18nMap | null
  lang: string
}): string {
  const mapped = pickMap(input.descriptionI18n || undefined, input.lang)
  if (mapped && descriptionOkForLang(mapped, input.lang)) return mapped

  const channel = String(input.description || '').trim()
  const fallback = String(input.descriptionDefault || '').trim()
  const key = langKey(input.lang)

  if (key === 'th') return channel || fallback

  if (channel && descriptionOkForLang(channel, key)) return channel
  if (fallback && descriptionOkForLang(fallback, key)) return fallback
  return ''
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
  const name = resolvePosMenuGuestName({ name: input.name, nameI18n: input.nameI18n, lang: input.lang })
  const desc = resolvePosMenuGuestDescription({
    description: input.description,
    descriptionI18n: input.descriptionI18n,
    lang: input.lang,
  })
  return [
    input.name,
    name,
    input.description,
    desc,
    input.category,
    input.categoryMain,
    resolvePosMenuGuestLabel(String(input.category || ''), input.lang),
    resolvePosMenuGuestLabel(String(input.categoryMain || ''), input.lang),
    ...Object.values(input.nameI18n || {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}
