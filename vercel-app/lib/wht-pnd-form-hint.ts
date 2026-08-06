/** 50 ทวิ·원천징수 원장 — ภ.ง.ด.3(บุคคลธรรมดา) vs ภ.ง.ด.53(นิติบุคคล) */

export type WhtPndFormHint = 'PND3' | 'PND53'

const THAI_SCRIPT_RE = /[\u0E00-\u0E7F]/

function digitsOnly(raw: string): string {
  return String(raw || '').replace(/\D/g, '')
}

/**
 * 태국 TIN 13자리:
 * - นิติบุคคล(DBD) 등록번호는 보통 0으로 시작
 * - บัตรประชาชน(개인)은 1~8로 시작
 */
export function classifyThaiTinForPnd(taxId: string | null | undefined): WhtPndFormHint | null {
  const tin = digitsOnly(String(taxId || ''))
  if (tin.length !== 13) return null
  const first = tin[0]
  if (first === '0') return 'PND53'
  if (first >= '1' && first <= '8') return 'PND3'
  return null
}

function looksLikeJuristicPerson(payeeName: string): boolean {
  const n = payeeName.trim()
  if (!n) return false
  return (
    /\bco\.?\s*,?\s*ltd\.?\b/i.test(n) ||
    /\blimited\b/i.test(n) ||
    /\bcompany\b/i.test(n) ||
    /\bcorp(?:oration)?\.?\b/i.test(n) ||
    /\binc\.?\b/i.test(n) ||
    /\bplc\b/i.test(n) ||
    /บริษัท/i.test(n) ||
    /จำกัด/i.test(n) ||
    /(?:^|\s)หจก\.?/i.test(n) ||
    /(?:^|\s)บจก\.?/i.test(n) ||
    /(?:^|\s)บมจ\.?/i.test(n) ||
    /มหาชน/i.test(n) ||
    /สมาคม/i.test(n) ||
    /foundation/i.test(n) ||
    /มูลนิธิ/i.test(n)
  )
}

function looksLikeNaturalPerson(payeeName: string, incomeType: string): boolean {
  if (looksLikeJuristicPerson(payeeName)) return false

  const income = incomeType.trim().toLowerCase()
  if (
    income.includes('개인') ||
    income.includes('프리랜서') ||
    income.includes('freelance') ||
    income.includes('individual') ||
    income.includes('บุคคลธรรมดา') ||
    income.includes('บุคคล')
  ) {
    return true
  }

  const name = payeeName.trim()
  if (!name) return false
  const nameLower = name.toLowerCase()
  if (
    nameLower.startsWith('mr ') ||
    nameLower.startsWith('ms ') ||
    nameLower.startsWith('mrs ') ||
    nameLower.startsWith('miss ') ||
    nameLower.startsWith('นาย') ||
    nameLower.startsWith('นาง') ||
    nameLower.startsWith('น.ส.') ||
    nameLower.startsWith('น.s.') ||
    nameLower.startsWith('คุณ')
  ) {
    return true
  }

  // 태국어 이름(직함 없음) — 법인 키워드가 없으면 บุคคลธรรมดา로 본다
  // 예: รักษา วิจิตรโสภาพันธ์
  if (THAI_SCRIPT_RE.test(name)) return true

  return false
}

/** 수동 form_hint가 있으면 우선, 없으면 거래처명·TIN·소득유형으로 PND3/PND53 판정 */
export function resolveWhtPndFormHint(params: {
  incomeType?: string | null
  payeeName?: string | null
  payeeTaxId?: string | null
  manualHint?: string | null
}): WhtPndFormHint {
  const manual = String(params.manualHint || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (manual.includes('3') && !manual.includes('53')) return 'PND3'
  if (manual.includes('53')) return 'PND53'

  const payeeName = String(params.payeeName || '').trim()
  const incomeType = String(params.incomeType || '').trim()

  if (looksLikeJuristicPerson(payeeName)) return 'PND53'

  // 13자리 TIN이 있으면 휴리스틱보다 우선 (태국어 상호+법인 TIN → PND53)
  const tinHint = classifyThaiTinForPnd(params.payeeTaxId)
  if (tinHint) return tinHint

  return looksLikeNaturalPerson(payeeName, incomeType) ? 'PND3' : 'PND53'
}
