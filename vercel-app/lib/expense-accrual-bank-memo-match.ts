/**
 * 통장 적요·note vs 지급예정(payee + 거래처) — 잘못된 지급 대상 연결을 줄이기 위한 느슨한 문구 일치
 * - mismatch: 적요에 나온 식별 토큰들이 지급처 정보와 뚜렷히 어긋날 때(충분히 긴 적요 기준)
 * - 100% 보장이 아님(은행/명칭 차이) → uncertain 사용
 */

const STOP = new Set(
  [
    'trf', 'trns', 'ft', 'tfr', 'ref', 'pmt', 'ibanking', 'transfer', 'payment', 'debit', 'credit',
    'from', 'to', 'and', 'the', 'ltd', 'co', 'jsc', 'plc', 'inc', 'llc', 'bbl', 'scb', 'kbank', 'ktb',
  ].map((s) => s.toLowerCase())
)

const TH_STOP = new Set(
  `โอน|เงิน|รับ|จ่าย|บัญชี|ธนาคาร|สาขา|จาก|เข้า|ออก|ชำระ|ฝาก|ถอน|ค่า|อ้างอิง|หมายเหตุ|นามสกุล|ชื่อ|อ้าง|ตัด|รายการ|สำหรับ|ใบ|เสร็จ|มัดจำ`
    .split('|')
)

function normalize(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * [a-z0-9&]{2+}, 태국어 2+ 자
 */
function extractSignatureTokens(whole: string): string[] {
  const norm = normalize(whole)
  if (!norm) return []
  const m = norm.match(/[a-z0-9&]{2,}|[\u0E00-\u0E7F]{2,}/g)
  if (!m) return []
  return [...new Set(m.map((t) => t.toLowerCase()))]
    .filter((t) => t.length >= 2 && !STOP.has(t) && !TH_STOP.has(t))
}

export type PayeeMemoMatchQuality = 'ok' | 'uncertain' | 'mismatch' | 'trivial'

export function evaluatePayeeBankMemoMatch(params: {
  bankMemo: string
  bankNote: string
  payeeName: string
  payeeCode: string
  vendorName?: string
  vendorGpsName?: string
}): { quality: PayeeMemoMatchQuality; detail?: string } {
  const bankText = [params.bankMemo, params.bankNote].map((s) => String(s || '')).join(' ').trim()
  const b = normalize(bankText)
  if (b.length < 8) {
    return { quality: 'trivial', detail: '짧은 적요' }
  }

  const payeeName = String(params.payeeName || '').trim()
  const payeeCode = String(params.payeeCode || '').trim()
  const vName = String(params.vendorName || '').trim()
  const vGps = String(params.vendorGpsName || '').trim()
  const hay = normalize([payeeName, payeeCode, vName, vGps].filter(Boolean).join(' '))
  if (!hay) {
    return { quality: 'uncertain', detail: '지급 대상 문구 없음' }
  }

  if (payeeCode.length >= 2 && b.includes(payeeCode.toLowerCase())) {
    return { quality: 'ok', detail: '지급처 코드가 적요에 있음' }
  }

  for (const w of payeeName
    .toLowerCase()
    .split(/[^a-z0-9&\u0E00-\u0E7F]+/g)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)) {
    if (b.includes(w)) {
      return { quality: 'ok', detail: '지급처명(단어)이 적요에 있음' }
    }
  }

  for (const s of [vGps, vName]) {
    const t = s.trim().toLowerCase()
    if (t.length >= 4 && b.includes(t)) {
      return { quality: 'ok', detail: '거래처명이 적요에 있음' }
    }
  }

  // 매장/법인 토큰: gps_name, name 짧은 단절(예: Future, Aisa, Silom)
  for (const s of [vGps, vName, payeeName]) {
    for (const w of s.split(/[^a-z0-9&\u0E00-\u0E7F]+/g)) {
      if (w.length < 3) continue
      const wn = w.toLowerCase()
      if (b.includes(wn) && wn.length >= 3) {
        return { quality: 'ok', detail: '상대(단절) 일치' }
      }
    }
  }

  const toks = extractSignatureTokens(bankText)
  if (toks.length === 0) {
    return { quality: 'trivial', detail: '특이 토큰 없음' }
  }

  const pNorm = payeeCode.toLowerCase()
  let anyHit = false
  for (const t of toks) {
    if (t.length < 2) continue
    if (hay.includes(t)) {
      anyHit = true
      break
    }
    if (pNorm.length >= 2 && t.includes(pNorm)) {
      anyHit = true
      break
    }
  }
  if (anyHit) {
    return { quality: 'ok', detail: '적요·지급처 토큰 겹침' }
  }

  const longToks = toks.filter((t) => t.length >= 4)
  if (b.length >= 20 && (longToks.length >= 2 || (longToks.length === 1 && longToks[0].length >= 6))) {
    return { quality: 'mismatch', detail: '적요 키워드가 지급처(거래처)와 겹치지 않음' }
  }

  return { quality: 'uncertain', detail: '겹침 불명확' }
}

export function isStrictPayeeMemoMismatch(quality: PayeeMemoMatchQuality): boolean {
  return quality === 'mismatch'
}
