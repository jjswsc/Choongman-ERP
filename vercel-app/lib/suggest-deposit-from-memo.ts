/**
 * 은행 적요(memo)로 입금 용도/계정과목 자동 추천
 * 배달앱, 카드, QR/이체, 현금입금 등
 */
import { POS_CHANNEL_SETTLEMENT_MEMO_RE } from './bank-import-deposit-category'

export type DepositCategory =
  | 'revenue_delivery'
  | 'revenue_card'
  | 'revenue_qr'
  | 'revenue_cash'
  | 'receivable_receive'
  | 'correction'

/**
 * POS 주문 자동분개(카드·배달→1130) 매장: 채널 정산 입금은 매출 수령으로만 분류 (revenue_* 이중 매출 방지).
 * 현금·미식별 입금만 revenue_* 유지.
 */
export function suggestDepositFromMemo(
  memo: string,
  revenueSubjects: { id?: number; code: string }[],
  options?: { preferReceivableClearing?: boolean }
): { category: DepositCategory; accountSubjectId?: number } | null {
  const m = (memo || '').toLowerCase().trim()
  if (!m) return null

  const preferAr = options?.preferReceivableClearing !== false
  const byCode = Object.fromEntries((revenueSubjects || []).map((s) => [s.code, s.id]).filter(([, id]) => id != null))

  const channelSettlement = POS_CHANNEL_SETTLEMENT_MEMO_RE.test(m)
  const looksLikeChannelSales =
    channelSettlement ||
    /\b(grabfood|grab|line\s*man|lineman|shopee|food\s*panda|foodpanda|robinhood|delivery|배달|visa|master|mastercard|unionpay|jcb|card|credit|카드|qr|promptpay|truemoney)\b/i.test(
      m
    )

  if (preferAr && looksLikeChannelSales) {
    return { category: 'receivable_receive' }
  }

  // 배달앱 - 세부 구분 (preferAr 꺼진 레거시·비POS 경로)
  if (/grabfood|\bgrab\b/i.test(m)) return { category: 'revenue_delivery', accountSubjectId: byCode['4111'] ?? byCode['4110'] }
  if (/\b(line\s*man|lineman)\b/i.test(m)) return { category: 'revenue_delivery', accountSubjectId: byCode['4112'] ?? byCode['4110'] }
  if (/\bshopee\b/i.test(m)) return { category: 'revenue_delivery', accountSubjectId: byCode['4113'] ?? byCode['4110'] }
  if (/\b(food\s*panda|foodpanda)\b/i.test(m)) return { category: 'revenue_delivery', accountSubjectId: byCode['4114'] ?? byCode['4110'] }
  if (/\brobinhood\b/i.test(m)) return { category: 'revenue_delivery', accountSubjectId: byCode['4115'] ?? byCode['4110'] }
  if (/\b(delivery|배달)\b/i.test(m)) return { category: 'revenue_delivery', accountSubjectId: byCode['4110'] }

  // 카드 - 태국 기준 브랜드(비자, 마스터 등)
  if (/\bvisa\b/i.test(m)) return { category: 'revenue_card', accountSubjectId: byCode['4121'] ?? byCode['4120'] }
  if (/\b(master|mastercard)\b/i.test(m)) return { category: 'revenue_card', accountSubjectId: byCode['4122'] ?? byCode['4120'] }
  if (/\bunionpay\b/i.test(m)) return { category: 'revenue_card', accountSubjectId: byCode['4123'] ?? byCode['4120'] }
  if (/\bjcb\b/i.test(m)) return { category: 'revenue_card', accountSubjectId: byCode['4124'] ?? byCode['4120'] }
  if (/\b(card|credit|카드)\b/i.test(m)) return { category: 'revenue_card', accountSubjectId: byCode['4120'] }

  // QR/이체
  if (/\b(qr|promptpay|truemoney|scb|이체|transfer|입금)\b/i.test(m)) {
    return { category: 'revenue_qr', accountSubjectId: byCode['4130'] ?? undefined }
  }

  // 현금
  if (/\b(cash|현금)\b/i.test(m)) {
    return { category: 'revenue_cash', accountSubjectId: byCode['4140'] ?? undefined }
  }

  return null
}
