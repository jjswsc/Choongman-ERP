import { fromHex, parseHypercomFrame } from '@/lib/payments/hypercom-v2'

export type LinkposTenderGroup = 'card' | 'qr'

export type LinkposTenderRule = {
  storeCode: string
  keyword: string
  group: LinkposTenderGroup
  key: string
  priority: number
}

function normalizeToken(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, '')
}

/** KBank LINKPOS 응답·Hypercom 필드에서 tender 분류용 haystack */
export function buildLinkposTenderHaystack(
  responseText: string,
  responseRawHex: string,
  bankId: string
): string {
  let parsedText = ''
  if (responseRawHex) {
    try {
      const parsed = parseHypercomFrame(fromHex(responseRawHex))
      parsedText = Object.values(parsed.fields || {}).join(' ')
    } catch {
      parsedText = ''
    }
  }
  return normalizeToken(`${responseText} ${parsedText} ${bankId}`)
}

export function classifyLinkposTenderByRules(
  haystack: string,
  storeCode: string,
  sharedRules: LinkposTenderRule[],
  storeRulesMap: Map<string, LinkposTenderRule[]>
): { group: LinkposTenderGroup; key: string } | null {
  const scoped = storeRulesMap.get(normalizeToken(storeCode)) || []
  const candidates = [...scoped, ...sharedRules]
  for (const r of candidates) {
    if (!r.keyword) continue
    if (haystack.includes(r.keyword)) return { group: r.group, key: r.key }
  }
  return null
}

/** Kasikorn LINKPOS 기본 tender 분류 — 결산·매출관리 공용 */
export function classifyLinkposTender(haystack: string): { group: LinkposTenderGroup; key: string } {
  const hay = haystack
  if (/prompt\s*pay|promptpay|thai\s*qr|truemoney|true\s*money|alipay|wechat|qr/.test(hay)) {
    if (/alipay/.test(hay)) return { group: 'qr', key: 'alipay' }
    if (/wechat/.test(hay)) return { group: 'qr', key: 'wechat' }
    if (/truemoney|true\s*money/.test(hay)) return { group: 'qr', key: 'true_money_wallet' }
    if (/line\s*pay|linepay/.test(hay)) return { group: 'qr', key: 'line_pay' }
    if (/shopee\s*pay|shopeepay/.test(hay)) return { group: 'qr', key: 'shopee_pay' }
    if (/prompt\s*pay|promptpay|thai\s*qr/.test(hay)) return { group: 'qr', key: 'promptpay' }
    return { group: 'qr', key: 'online_banking' }
  }
  if (/visa/.test(hay)) return { group: 'card', key: 'visa' }
  if (/master|mastercard/.test(hay)) return { group: 'card', key: 'master_card' }
  if (/jcb/.test(hay)) return { group: 'card', key: 'jcb' }
  if (/amex|american\s*express/.test(hay)) return { group: 'card', key: 'amex' }
  if (/union\s*pay|unionpay|cup/.test(hay)) return { group: 'card', key: 'unionpay' }
  if (/gift\s*voucher|voucher/.test(hay)) return { group: 'qr', key: 'gift_voucher' }
  return { group: 'card', key: 'card_other' }
}

export function resolveLinkposTender(
  haystack: string,
  storeCode: string,
  sharedRules: LinkposTenderRule[],
  storeRulesMap: Map<string, LinkposTenderRule[]>
): { group: LinkposTenderGroup; key: string } {
  return (
    classifyLinkposTenderByRules(haystack, storeCode, sharedRules, storeRulesMap) ||
    classifyLinkposTender(haystack)
  )
}

/** Flowaccount Credit Card 표 행 순서 */
export const CREDIT_PAYMENT_CHANNEL_DISPLAY_ORDER = [
  'alipay',
  'gift_voucher',
  'jcb',
  'master_card',
  'online_banking',
  'promptpay',
  'unionpay',
  'visa',
  'wechat',
  'true_money_wallet',
  'line_pay',
  'shopee_pay',
  'card_other',
  'cash',
] as const

export function normalizeCreditPaymentChannelKey(raw: string): string {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
  if (!v) return 'card_other'
  if (v === 'master' || v === 'mastercard') return 'master_card'
  if (v === 'truemoney' || v === 'true_money') return 'true_money_wallet'
  if (v === 'other_truemoney') return 'true_money_wallet'
  if (v === 'other_wechat') return 'wechat'
  if (v === 'other_alipay') return 'alipay'
  if (v === 'other_unionpay') return 'unionpay'
  if (v === 'other_linepay') return 'line_pay'
  if (v === 'other_shopeepay') return 'shopee_pay'
  if (v === 'other_misc') return 'card_other'
  return v
}
