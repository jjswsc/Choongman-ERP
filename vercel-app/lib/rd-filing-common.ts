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

export function splitThaiPayeeName(payeeName: string): {
  titleName: string
  firstName: string
  surName: string
} {
  const raw = rdPipeSafe(payeeName)
  if (!raw) return { titleName: '', firstName: '', surName: '' }
  if (/บริษัท|ห้างหุ้นส่วน|จำกัด/i.test(raw)) {
    return { titleName: 'บริษัท', firstName: raw, surName: '' }
  }
  const titleMatch = raw.match(/^(นาย|นาง|นางสาว|น\.ส\.|Mr\.|Mrs\.|Ms\.)\s*(.+)$/i)
  if (titleMatch) {
    return { titleName: titleMatch[1]!, firstName: titleMatch[2]!.trim(), surName: '' }
  }
  return { titleName: '', firstName: raw, surName: '' }
}

export function payeeTin10(taxId13: string): string {
  const d = rdDigitsOnly(taxId13)
  if (d.length >= 10) return d.slice(0, 10)
  if (!d) return '0000000000'
  return d.padStart(10, '0')
}
