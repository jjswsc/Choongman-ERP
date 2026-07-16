/** 50 ทวิ·원천징수 원장 — ภ.ง.ด.3(บุคคลธรรมดา) vs ภ.ง.ด.53(นิติบุคคล) */

export type WhtPndFormHint = 'PND3' | 'PND53'

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

  const name = payeeName.trim().toLowerCase()
  if (!name) return false
  return (
    name.startsWith('mr ') ||
    name.startsWith('ms ') ||
    name.startsWith('mrs ') ||
    name.startsWith('miss ') ||
    name.startsWith('นาย') ||
    name.startsWith('นาง') ||
    name.startsWith('น.ส.') ||
    name.startsWith('น.s.') ||
    name.startsWith('คุณ')
  )
}

/** 수동 form_hint가 있으면 우선, 없으면 거래처명·소득유형으로 PND3/PND53 판정 */
export function resolveWhtPndFormHint(params: {
  incomeType?: string | null
  payeeName?: string | null
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
  return looksLikeNaturalPerson(payeeName, incomeType) ? 'PND3' : 'PND53'
}
