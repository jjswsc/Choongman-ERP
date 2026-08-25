/**
 * 은행 적요(memo)로 출금 용도/계정과목 자동 추천
 * 이체, 고정비, 비용 등
 */

import {
  looksLikeSsoRemittanceMemo,
  looksLikeTaxAuthorityRemittanceMemo,
} from '@/lib/bank-transaction-note-meta'

export type WithdrawCategory = 'transfer' | 'expense' | 'correction' | 'loan' | 'advance' | 'unclassified' | 'tax'

/** 출금 시 적요 기반 용도·계정과목 추천 */
export function suggestWithdrawFromMemo(
  memo: string,
  accountSubjects: { id?: number; code: string; type?: string; pAndLSection?: string | null }[]
): { category: WithdrawCategory; accountSubjectId?: number } | null {
  const m = (memo || '').toLowerCase().trim()
  if (!m) return null

  const byCode = Object.fromEntries((accountSubjects || []).map((s) => [s.code, s.id]).filter(([, id]) => id != null))

  // 이체/보충
  if (/\b(보충|이체|정산|replenish|transfer|패티캐시|petty)\b/i.test(m)) {
    return { category: 'transfer', accountSubjectId: byCode['1110'] }
  }

  // 대여 (돈 빌려줌/빌려옴)
  if (/\b(대여|빌려|차용|loan|borrow|ยืม)\b/i.test(m)) {
    return { category: 'loan' }
  }

  // 전도금 (선급)
  if (/\b(전도|선급|선지급|advance|prepay|ล่วงหน้า)\b/i.test(m)) {
    return { category: 'advance' }
  }

  // VAT·원천 등 세무서 납부(BS) — 손익 5510으로 올리지 않음
  if (looksLikeTaxAuthorityRemittanceMemo(memo) || looksLikeSsoRemittanceMemo(memo)) {
    return { category: 'tax' }
  }

  // 반복 경비(임대·공과 등) — 통장 용도는 경비(expense)로 통일
  if (/\b(월세|임대|rent|rental|집세)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5410'] }
  if (/\b(전기|electricity|ไฟฟ้า)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5430'] }
  if (/\b(수도|water|광열|gas|ประปา)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5440'] }
  if (/\b(인터넷|통신|internet|โทรศัพท์)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5420'] ?? byCode['5470'] }
  if (/\b(급여|salary|월급|ค่าจ้าง)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5310'] }
  if (/\b(상여|bonus|보너스)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5320'] }
  if (/\b(복리|복지|welfare|สวัสดิการ)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5330'] }
  if (/\b(보험|insurance|ประกัน)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5490'] }
  if (/\b(감가|depreciation)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5500'] }

  // 비용
  if (/\b(접대|entertainment|รับรอง)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5450'] }
  if (/\b(교통|차|transport|รถ)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5460'] ?? byCode['5461'] }
  if (/\b(차량|vehicle)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5461'] ?? byCode['5460'] }
  if (/\b(통신비|전화|phone)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5470'] }
  if (/\b(소모품|supplies)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5480'] }
  if (/\b(세금|tax|ภาษี)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5510'] }
  if (/\b(홍보|promotion)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5524'] }
  if (/\b(광고|advertising)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5525'] }
  if (/\b(프로모션|promo)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5526'] }
  if (/\b(sns|마케팅|marketing)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5527'] }
  if (/\b(grab|lineman|shopee|robinhood|delivery app|배달앱|delivery fee|platform fee)\b/i.test(m)) {
    return { category: 'expense', accountSubjectId: byCode['5528'] }
  }
  if (/\b(card fee|카드수수료|credit card fee|merchant fee)\b/i.test(m)) {
    return { category: 'expense', accountSubjectId: byCode['5529'] }
  }
  if (/\b(용역|service)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5521'] }
  if (/\b(연구|rnd|r&d)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5522'] }
  if (/\b(수리|repair)\b/i.test(m)) return { category: 'expense', accountSubjectId: byCode['5523'] }

  return null
}
