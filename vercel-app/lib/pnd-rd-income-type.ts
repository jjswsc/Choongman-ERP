/**
 * RD Prep ใบแนบ ประเภทเงินได้
 * PND3/53: 소득 종류만 (세율은 อัตรา 칸). PND1: มาตรา 40 상세 문구.
 */

export const PND1_INCOME_40_1_GENERAL =
  'เงินได้ตามมาตรา 40(1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป'
export const PND1_INCOME_40_1_PCT3 =
  'เงินได้ตามมาตรา 40(1) เงินเดือน ค่าจ้าง ฯลฯ กรณีได้รับอนุมัติจากกรมฯ ให้หักอัตราร้อยละ 3'
export const PND1_INCOME_40_1_2_SEVERANCE =
  'เงินได้ตามมาตรา 40(1)(2) กรณีนายจ้างจ่ายให้ครั้งเดียวเพราะเหตุออกจากงาน'
export const PND1_INCOME_40_2_RESIDENT =
  'เงินได้ตามมาตรา 40(2) กรณีผู้มีเงินได้เป็นผู้อยู่ในประเทศไทย'

export function stripIncomeTypeTaxRate(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/[|]/g, ' ')
    .trim()
    .replace(/\s+\d+(?:[.,]\d+)?\s*%\s*$/u, '')
    .trim()
}

function finiteRate(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function toPnd1IncomeTypeLabel(raw: unknown, whtRate?: number | string | null): string {
  const s = stripIncomeTypeTaxRate(raw)
  if (/มาตรา\s*40\s*\(\s*1\s*\)\s*\(\s*2\s*\)/u.test(s) || /ออกจากงาน/u.test(s) || /severance/i.test(s)) {
    return PND1_INCOME_40_1_2_SEVERANCE
  }
  if (/มาตรา\s*40\s*\(\s*2\s*\)/u.test(s) || /ค่าธรรมเนียม|ค่านายหน้า/u.test(s)) {
    return PND1_INCOME_40_2_RESIDENT
  }
  if (/ให้หักอัตราร้อยละ\s*3/u.test(s)) {
    return PND1_INCOME_40_1_PCT3
  }
  if (/มาตรา\s*40\s*\(\s*1\s*\)/u.test(s) || /กรณีทั่วไป/u.test(s)) {
    return PND1_INCOME_40_1_GENERAL
  }

  const rate = finiteRate(whtRate)
  const is3pct = rate != null && Math.abs(rate - 3) < 0.15
  const looksSalary =
    !s ||
    /급여|เงินเดือน|ค่าจ้าง|salary|wage|payroll/i.test(s) ||
    /salary|wage/i.test(s)

  if (looksSalary && is3pct) return PND1_INCOME_40_1_PCT3
  if (looksSalary) return PND1_INCOME_40_1_GENERAL
  if (is3pct) return PND1_INCOME_40_1_PCT3
  return PND1_INCOME_40_1_GENERAL
}
