import { resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'

export type WithholdingTaxLedgerRow = {
  id?: number
  payment_date?: string
  tax_month?: string
  payee_name?: string | null
  payee_tax_id?: string | null
  income_type?: string | null
  gross_amount?: number | string | null
  wht_rate?: number | string | null
  wht_amount?: number | string | null
  form_hint?: string | null
  certificate_no?: string | null
  filing_status?: string | null
  submitted_at?: string | null
  submitted_by?: string | null
  memo?: string | null
  store_name?: string | null
}

function escCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export type PndFormHint = 'PND3' | 'PND53' | 'ALL'

/** 원장 form_hint 계열 — ภ.ง.ด.1 / 1ก / 3 / 53 구분 (53을 3보다 먼저 판정) */
export type WhtLedgerFormFamily = 'PND1' | 'PND1A' | 'PND3' | 'PND53' | 'OTHER'

export function classifyWhtLedgerFormFamily(v: unknown): WhtLedgerFormFamily {
  const raw = String(v || '')
    .trim()
    .replace(/\s+/g, '')
  if (!raw) return 'OTHER'
  const upper = raw.toUpperCase()
  // 1ก / PND1A 를 PND1·PND3보다 먼저
  if (
    raw.includes('1ก') ||
    upper.includes('1K') ||
    upper.includes('PND1A') ||
    raw.includes('ภ.ง.ด.1ก') ||
    raw.includes('ภงด.1ก') ||
    raw.includes('ภงด1ก')
  ) {
    return 'PND1A'
  }
  if (
    upper.includes('PND1') ||
    raw.includes('ภ.ง.ด.1') ||
    raw.includes('ภงด.1') ||
    raw.includes('ภงด1') ||
    upper === '1'
  ) {
    return 'PND1'
  }
  if (upper.includes('53') || raw.includes('ภ.ง.ด.53') || raw.includes('ภงด.53') || raw.includes('ภงด53')) {
    return 'PND53'
  }
  if (
    upper.includes('PND3') ||
    raw.includes('ภ.ง.ด.3') ||
    raw.includes('ภงด.3') ||
    raw.includes('ภงด3') ||
    (upper.includes('3') && !upper.includes('53'))
  ) {
    return 'PND3'
  }
  return 'OTHER'
}

/**
 * PND3/PND53 제출·검증용.
 * PND1·미분류는 ALL로 두어 PND53에 잘못 묶이지 않게 한다(이전 기본값 PND53 버그 수정).
 */
export function normalizePndFormHint(v: unknown): PndFormHint {
  const raw = String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!raw || raw === 'ALL') return 'ALL'
  const family = classifyWhtLedgerFormFamily(v)
  if (family === 'PND3') return 'PND3'
  if (family === 'PND53') return 'PND53'
  return 'ALL'
}

/** 빈/모호한 form_hint 는 거래처·TIN으로 PND3/53 추정. PND1·1ก 은 null. */
export function effectivePnd353FormHint(row: {
  form_hint?: string | null
  payee_name?: string | null
  payee_tax_id?: string | null
  income_type?: string | null
}): 'PND3' | 'PND53' | null {
  const family = classifyWhtLedgerFormFamily(row.form_hint)
  if (family === 'PND1' || family === 'PND1A') return null
  if (family === 'PND3') return 'PND3'
  if (family === 'PND53') return 'PND53'
  return resolveWhtPndFormHint({
    incomeType: row.income_type,
    payeeName: row.payee_name,
    payeeTaxId: row.payee_tax_id,
    manualHint: row.form_hint,
  })
}

/** 세무 탭(pnd1/pnd3/pnd53)별 원장 행 매칭 */
export function whtLedgerRowMatchesFocusMode(
  row: {
    form_hint?: string | null
    payee_name?: string | null
    payee_tax_id?: string | null
    income_type?: string | null
  },
  focusMode: string | null | undefined
): boolean {
  const mode = String(focusMode || 'all').trim().toLowerCase()
  if (!mode || mode === 'all' || mode === 'pp36' || mode === 'pnd54') return true

  if (mode === 'pnd1' || mode === 'pnd1391') {
    return matchesPnd1FilingForm(row.form_hint, 'all')
  }

  const effective = effectivePnd353FormHint(row)
  if (mode === 'pnd3') return effective === 'PND3'
  if (mode === 'pnd53' || mode === 'pnd5354') return effective === 'PND53'
  return true
}

/**
 * PND1 RD Prep 내보내기/검증용.
 * filingForm=all 은 「PND1+1ก만」이지 원장 전체가 아님(PND3/53 혼입 방지).
 */
export function matchesPnd1FilingForm(
  formHint: unknown,
  filingForm: 'pnd1' | 'pnd1a' | 'all'
): boolean {
  const family = classifyWhtLedgerFormFamily(formHint)
  if (filingForm === 'all') return family === 'PND1' || family === 'PND1A'
  if (filingForm === 'pnd1a') return family === 'PND1A'
  return family === 'PND1'
}

/** 집계·요약용 서식 키 (빈 hint는 거래처/TIN으로 PND3/53 추정) */
export function resolveWhtSummaryFormKey(row: {
  form_hint?: string | null
  payee_name?: string | null
  payee_tax_id?: string | null
  income_type?: string | null
}): string {
  const family = classifyWhtLedgerFormFamily(row.form_hint)
  if (family === 'PND1' || family === 'PND1A') return family
  if (family === 'PND3' || family === 'PND53') return family
  const effective = effectivePnd353FormHint(row)
  return effective || 'UNCLASSIFIED'
}

export function withholdingTaxLedgerToCsv(rows: WithholdingTaxLedgerRow[]): string {
  const header = [
    'id',
    'payment_date',
    'tax_month',
    'store_name',
    'payee_name',
    'payee_tax_id',
    'income_type',
    'gross_amount',
    'wht_rate',
    'wht_amount',
    'form_hint',
    'certificate_no',
    'filing_status',
    'submitted_at',
    'submitted_by',
    'memo',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        String(r.id ?? ''),
        escCell(String(r.payment_date ?? '')),
        escCell(String(r.tax_month ?? '')),
        escCell(String(r.store_name ?? '')),
        escCell(String(r.payee_name ?? '')),
        escCell(String(r.payee_tax_id ?? '')),
        escCell(String(r.income_type ?? '')),
        String(r.gross_amount ?? ''),
        String(r.wht_rate ?? ''),
        String(r.wht_amount ?? ''),
        escCell(String(r.form_hint ?? '')),
        escCell(String(r.certificate_no ?? '')),
        escCell(String(r.filing_status ?? '')),
        escCell(String(r.submitted_at ?? '')),
        escCell(String(r.submitted_by ?? '')),
        escCell(String(r.memo ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}

export function withholdingTaxSubmissionCsv(rows: WithholdingTaxLedgerRow[], formHint: PndFormHint): string {
  const header = [
    'seq_no',
    'form_hint',
    'payment_date',
    'payee_name',
    'payee_tax_id',
    'income_type',
    'gross_amount',
    'wht_rate',
    'wht_amount',
    'certificate_no',
    'store_name',
    'memo',
  ]
  const lines = [header.join(',')]
  const filtered = rows.filter((r) => {
    if (formHint === 'ALL') {
      return effectivePnd353FormHint(r) != null
    }
    return effectivePnd353FormHint(r) === formHint
  })
  for (let i = 0; i < filtered.length; i += 1) {
    const r = filtered[i]
    lines.push(
      [
        String(i + 1),
        escCell(formHint === 'ALL' ? String(effectivePnd353FormHint(r) || '') : formHint),
        escCell(String(r.payment_date ?? '')),
        escCell(String(r.payee_name ?? '')),
        escCell(String(r.payee_tax_id ?? '')),
        escCell(String(r.income_type ?? '')),
        String(r.gross_amount ?? ''),
        String(r.wht_rate ?? ''),
        String(r.wht_amount ?? ''),
        escCell(String(r.certificate_no ?? '')),
        escCell(String(r.store_name ?? '')),
        escCell(String(r.memo ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}

