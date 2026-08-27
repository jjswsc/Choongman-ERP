/** 태국 국세청 RD e-Filing / RD Prep 공통 유틸 (pipe TXT · 파일명) */

export function rdPipeSafe(v: unknown): string {
  return String(v ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[*+/\\!$%#&@,'"]/g, ' ')
    .trim()
}

export function rdDigitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

export function rdFormatAmount2(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

/** ISO YYYY-MM-DD → ddmmyyyy (พ.ศ.) */
export function isoToRdBeDate8(v: unknown): string {
  const s = String(v ?? '').trim().slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const y = Number(m[1])
  if (!Number.isFinite(y)) return ''
  const be = y + 543
  return `${m[3]}${m[2]}${String(be)}`
}

export function taxMonthToRdParts(taxMonth: string): { month: string; yearBe: string } {
  const ym = String(taxMonth || '').trim().slice(0, 7)
  const [y, mo] = ym.split('-')
  const month = (mo || '01').padStart(2, '0')
  const yearBe = String((Number(y) || 0) + 543)
  return { month, yearBe }
}

/** RD Prep → e-Filing 업로드용 .rdx 파일명 (샘플 패턴 기준) */
export function buildRdFilingRdxFilename(params: {
  taxId13: string
  formCode: '30' | '53'
  taxMonth: string
  branchNo6?: string
  version5?: string
  suffix?: string
}): string {
  const taxId = rdDigitsOnly(params.taxId13).slice(0, 13)
  const { month, yearBe } = taxMonthToRdParts(params.taxMonth)
  const branch = rdDigitsOnly(params.branchNo6).padStart(4, '0').slice(-4) || '0000'
  const ver = String(params.version5 || '00000').padStart(5, '0').slice(0, 5)
  const form = params.formCode === '30' ? 'P30' : 'P53'
  const suffix = String(params.suffix || (params.formCode === '30' ? '010100' : '010000'))
  return `${taxId}V${ver}${form}${yearBe}${month}${branch}-${suffix}.rdx`
}

/** 공식 TXT 파일명: TAX_TYPE_NID_BRANCH_TAX_YEAR_TAX_MONTH_FORM_TYPE_00.txt */
export function buildRdFilingTxtFilename(params: {
  taxType: string
  taxId13: string
  taxMonth: string
  branchNo6?: string
  formType?: string
  sendNo?: string
}): string {
  const taxId = rdDigitsOnly(params.taxId13).slice(0, 13)
  const { month, yearBe } = taxMonthToRdParts(params.taxMonth)
  const branch = rdDigitsOnly(params.branchNo6).padStart(6, '0').slice(-6) || '000000'
  const formType = String(params.formType || '00').padStart(2, '0').slice(0, 2)
  const sendNo = String(params.sendNo || '00').padStart(2, '0').slice(0, 2)
  return `${params.taxType}_${taxId}_${branch}_${yearBe}_${month}_${formType}_${sendNo}.txt`
}

export type ThaiPayeeNameParts = {
  titleName: string
  firstName: string
  middleName: string
  surName: string
}

function emptyThaiPayeeNameParts(): ThaiPayeeNameParts {
  return { titleName: '', firstName: '', middleName: '', surName: '' }
}

/** 개인명 나머지: 마지막 토큰=ชื่อสกุล, 첫 토큰=ชื่อ, 가운데=ชื่อกลาง */
function splitGivenAndSurname(rest: string): Pick<ThaiPayeeNameParts, 'firstName' | 'middleName' | 'surName'> {
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', middleName: '', surName: '' }
  if (parts.length === 1) return { firstName: parts[0]!.slice(0, 160), middleName: '', surName: '' }
  if (parts.length === 2) {
    return { firstName: parts[0]!.slice(0, 160), middleName: '', surName: parts[1]!.slice(0, 160) }
  }
  return {
    firstName: parts[0]!.slice(0, 160),
    middleName: parts.slice(1, -1).join(' ').slice(0, 160),
    surName: parts[parts.length - 1]!.slice(0, 160),
  }
}

function extractNaturalPersonTitle(raw: string): { titleName: string; rest: string } {
  const khun = raw.match(/^คุณ\s+(.+)$/)
  if (khun?.[1]?.trim()) return { titleName: 'คุณ', rest: khun[1].trim() }
  // นางสาว before นาง, Miss before Ms. Glued titles (นายสมชาย / น.ส.ปิยวรรณ) allowed.
  const m = raw.match(/^(นางสาว|นาง|นาย|น\.ส\.|นส\.|Miss\.?|Mrs\.?|Mr\.?|Ms\.?)\s*(.+)$/i)
  if (m?.[2]?.trim()) return { titleName: m[1]!.trim(), rest: m[2].trim() }
  return { titleName: '', rest: raw }
}

export function splitThaiPayeeName(payeeName: string): ThaiPayeeNameParts {
  const raw = rdPipeSafe(payeeName)
  if (!raw) return emptyThaiPayeeNameParts()
  const juristicTitle = /ห้างหุ้นส่วนจำกัด|หจก\.?/i.test(raw)
    ? 'ห้างหุ้นส่วนจำกัด'
    : /ห้างหุ้นส่วน/i.test(raw)
      ? 'ห้างหุ้นส่วน'
      : /บริษัท|บจก\.?|บมจ\.?|จำกัด/i.test(raw)
        ? 'บริษัท'
        : null
  if (juristicTitle) {
    const stripped = raw
      .replace(/^(บริษัท|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วน|บจก\.?|บมจ\.?|หจก\.?)\s*/i, '')
      .trim()
    return {
      titleName: juristicTitle,
      firstName: (stripped || raw).slice(0, 160),
      middleName: '',
      surName: '',
    }
  }
  if (
    /\bco\.?\s*,?\s*ltd\.?\b/i.test(raw) ||
    /\blimited\b/i.test(raw) ||
    /\bcorp(?:oration)?\.?\b/i.test(raw) ||
    /\binc\.?\b/i.test(raw) ||
    /\bplc\b/i.test(raw)
  ) {
    return { titleName: '', firstName: raw.slice(0, 160), middleName: '', surName: '' }
  }
  const { titleName, rest } = extractNaturalPersonTitle(raw)
  return { titleName, ...splitGivenAndSurname(rest) }
}

export function payeeTin10(taxId13: string): string {
  const d = rdDigitsOnly(taxId13)
  if (d.length >= 10) return d.slice(0, 10)
  if (!d) return '0000000000'
  return d.padStart(10, '0')
}
