/** 본사(Head Office) — 인보이스·Tax Invoice·e-Tax FROM 단일 기본값 */
export const HEAD_OFFICE_DEFAULTS = {
  companyName: 'S&J GLOBAL CO., LTD. (Head Office)',
  address:
    '101 true digital park pegasus building, floor 5, unit 545, Sukhumvit Rd. Khwang Bang Chak, Khet Phra Khanong, Bangkok 10260',
  taxId: '0105566137147',
  phone: '091-072-6252',
  bankInfo: 'ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล',
  projectName: 'CM True Digital Park',
} as const

export type HeadOfficeInfoResolved = {
  companyName: string
  address: string
  taxId: string
  phone: string
  bankInfo: string
  projectName: string
}

type VendorHeadOfficeRow = {
  name?: string
  addr?: string
  tax_id?: string
  phone?: string
  memo?: string
}

function isBlankOrDash(value: string): boolean {
  const v = value.trim()
  return !v || v === '-'
}

const LEGACY_HEAD_OFFICE_NAMES = new Set([
  'บริษัท เอสแอนด์เจ โกลบอล จำกัด',
  'บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)',
  'S&J Global Co., Ltd',
  'S&J Global Co., Ltd.',
])

function normalizeHeadOfficeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '-' || LEGACY_HEAD_OFFICE_NAMES.has(trimmed)) {
    return HEAD_OFFICE_DEFAULTS.companyName
  }
  return trimmed
}

/** vendors 본사 행 → 인보이스용 본사 정보 (빈 addr 등은 기본값으로 보완) */
export function resolveHeadOfficeFromVendorRow(
  row: VendorHeadOfficeRow | null | undefined
): HeadOfficeInfoResolved {
  if (!row) {
    return { ...HEAD_OFFICE_DEFAULTS }
  }
  const addr = String(row.addr || '').trim()
  const name = String(row.name || '').trim()
  return {
    companyName: normalizeHeadOfficeName(name),
    address: isBlankOrDash(addr) ? HEAD_OFFICE_DEFAULTS.address : addr,
    taxId: String(row.tax_id || '').trim() || HEAD_OFFICE_DEFAULTS.taxId,
    phone: String(row.phone || '').trim() || HEAD_OFFICE_DEFAULTS.phone,
    bankInfo: String(row.memo || '').trim() || HEAD_OFFICE_DEFAULTS.bankInfo,
    projectName: HEAD_OFFICE_DEFAULTS.projectName,
  }
}
