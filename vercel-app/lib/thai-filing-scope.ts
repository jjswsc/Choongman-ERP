/**
 * 태국 법인 기준 주요 신고·등록 범위(ERP에서 담당 구분 선택용).
 * 실제 의무는 업종·법인 형태에 따라 다르므로 회계사와 확정 필요.
 */

export type ThaiFilingResponsibility = 'in_house' | 'tax_agent' | 'tbd'

export type ThaiFilingType =
  | 'vat_pp30'
  | 'vat_pp36'
  | 'wht_ppnd'
  | 'wht_pnd54'
  | 'cit_ppnd50'
  | 'dbd_annual_fs'
  | 'sso_contribution'
  | 'etax_timestamp'

export type ThaiFilingDefinition = {
  id: ThaiFilingType
  labelKo: string
  labelTh: string
  labelEn: string
  rdFormHint?: string
  frequencyKo: string
}

export const THAI_FILING_DEFINITIONS: ThaiFilingDefinition[] = [
  {
    id: 'vat_pp30',
    labelKo: '부가세 (ภ.พ.30)',
    labelTh: 'ภ.พ.30 ภาษีมูลค่าเพิ่ม',
    labelEn: 'VAT filing (PP.30)',
    rdFormHint: 'ภ.พ.30',
    frequencyKo: '일반적으로 월별',
  },
  {
    id: 'vat_pp36',
    labelKo: '해외서비스 부가세 (ภ.พ.36)',
    labelTh: 'ภ.พ.36 ภาษีมูลค่าเพิ่มจากบริการต่างประเทศ',
    labelEn: 'Imported service VAT (PP.36)',
    rdFormHint: 'ภ.พ.36',
    frequencyKo: '일반적으로 월별',
  },
  {
    id: 'wht_ppnd',
    labelKo: '원천징수 (ภ.ง.ด.3/53 등)',
    labelTh: 'ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.)',
    labelEn: 'Withholding tax (PND forms)',
    frequencyKo: '지급·월별 등 유형별',
  },
  {
    id: 'wht_pnd54',
    labelKo: '해외지급 원천세 (ภ.ง.ด.54)',
    labelTh: 'ภ.ง.ด.54 ภาษีหัก ณ ที่จ่ายจากต่างประเทศ',
    labelEn: 'Overseas withholding tax (PND.54)',
    rdFormHint: 'ภ.ง.ด.54',
    frequencyKo: '지급·월별 등 유형별',
  },
  {
    id: 'cit_ppnd50',
    labelKo: '법인세 (ภ.ง.ด.50 등)',
    labelTh: 'ภาษีเงินได้นิติบุคคล',
    labelEn: 'Corporate income tax',
    rdFormHint: 'ภ.ง.ด.50',
    frequencyKo: '반기·연말 등',
  },
  {
    id: 'dbd_annual_fs',
    labelKo: 'DBD 연간 재무제표 제출',
    labelTh: 'ยื่นงบการเงิน กพท.',
    labelEn: 'DBD annual financial statements',
    frequencyKo: '회계연도 종료 후 기한 내',
  },
  {
    id: 'sso_contribution',
    labelKo: '사회보험(SSO) 납부·신고',
    labelTh: 'ประกันสังคม (ประกันสังคม)',
    labelEn: 'Social Security Office contributions',
    frequencyKo: '월별',
  },
  {
    id: 'etax_timestamp',
    labelKo: 'e-Tax Invoice Time Stamp 등록',
    labelTh: 'ลงทะเบียน e-Tax Invoice by Time Stamp',
    labelEn: 'e-Tax Invoice by Time Stamp registration',
    frequencyKo: '최초 등록 후 수시 점검',
  },
]

export const DEFAULT_FILING_RESPONSIBILITIES: Record<ThaiFilingType, ThaiFilingResponsibility> = {
  vat_pp30: 'tbd',
  vat_pp36: 'tbd',
  wht_ppnd: 'tbd',
  wht_pnd54: 'tbd',
  cit_ppnd50: 'tbd',
  dbd_annual_fs: 'tbd',
  sso_contribution: 'tbd',
  etax_timestamp: 'tbd',
}

export function normalizeResponsibilities(
  raw: Record<string, unknown> | null | undefined
): Record<ThaiFilingType, ThaiFilingResponsibility> {
  const out = { ...DEFAULT_FILING_RESPONSIBILITIES }
  if (!raw || typeof raw !== 'object') return out
  for (const k of Object.keys(out) as ThaiFilingType[]) {
    const v = raw[k]
    if (v === 'in_house' || v === 'tax_agent' || v === 'tbd') out[k] = v
  }
  return out
}
