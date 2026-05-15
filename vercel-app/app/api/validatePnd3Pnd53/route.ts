import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'
import { buildTaxMonthPostgrestFilter, getThaiTaxFilingPeriodRange } from '@/lib/thai-tax-period'
import { normalizePndFormHint, type WithholdingTaxLedgerRow } from '@/lib/withholding-tax-csv'
import { requireAuth } from '@/lib/verify-auth'

function parseFilingStatus(v: unknown): '' | 'draft' | 'submitted' {
  const raw = String(v || '').trim().toLowerCase()
  if (raw === 'draft' || raw === 'submitted') return raw
  return ''
}

function normalizeLedgerFilingStatus(v: unknown): 'draft' | 'submitted' {
  return parseFilingStatus(v) === 'submitted' ? 'submitted' : 'draft'
}

type IssueCode =
  | 'missing_payee_name'
  | 'missing_payee_tax_id'
  | 'missing_income_type'
  | 'missing_certificate_no'
  | 'invalid_wht_rate'
  | 'non_positive_wht_amount'

type IssueRow = {
  lineNo: number
  rowId: number | null
  code: IssueCode
  message: string
  payeeName: string
  certificateNo: string
}

function hasValidTin(v: unknown): boolean {
  const digits = String(v || '').replace(/\D/g, '')
  return digits.length === 13
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const userRole = String(auth.role || '').trim()
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  const yearMonth = String(searchParams.get('yearMonth') || taxMonth).trim().slice(0, 7)
  const periodTypeRaw = String(searchParams.get('periodType') || 'monthly').trim().toLowerCase()
  const periodType = periodTypeRaw === 'annual' || periodTypeRaw === 'half_year' ? periodTypeRaw : 'monthly'
  const filingStatus = parseFilingStatus(searchParams.get('filingStatus'))
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  const formHint = normalizePndFormHint(searchParams.get('formHint'))

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: 'INVALID_YEAR_MONTH' }, { status: 400, headers })
  }

  try {
    const period = getThaiTaxFilingPeriodRange({ yearMonth, periodType })
    const monthFilter = buildTaxMonthPostgrestFilter(period.months)
    const filter = appendStoreNameFilter(monthFilter, storeFilter)
    const rows = (await supabaseSelectFilter('withholding_tax_ledger_entries', filter, {
      select: '*',
      limit: 20000,
      order: 'payment_date.asc,id.asc',
    })) as WithholdingTaxLedgerRow[] | null

    const filteredRows = (rows || []).filter((row) => {
      const statusOk =
        filingStatus === '' || normalizeLedgerFilingStatus(row.filing_status) === filingStatus
      if (!statusOk) return false
      if (formHint === 'ALL') return true
      return normalizePndFormHint(row.form_hint) === formHint
    })

    const warningCounts = {
      missingPayeeName: 0,
      missingPayeeTaxId: 0,
      missingIncomeType: 0,
      missingCertificateNo: 0,
      invalidWhtRate: 0,
      nonPositiveWithheldAmount: 0,
    }
    const issues: IssueRow[] = []
    const sampleWarnings: string[] = []
    let invalidRowCount = 0
    const pushIssue = (row: WithholdingTaxLedgerRow, lineNo: number, code: IssueCode, message: string) => {
      issues.push({
        lineNo,
        rowId: row.id != null ? Number(row.id) : null,
        code,
        message,
        payeeName: String(row.payee_name || '').trim(),
        certificateNo: String(row.certificate_no || '').trim(),
      })
      if (sampleWarnings.length < 10) sampleWarnings.push(message)
    }

    filteredRows.forEach((row, idx) => {
      const lineNo = idx + 1
      let rowHasIssue = false
      if (!String(row.payee_name || '').trim()) {
        warningCounts.missingPayeeName += 1
        rowHasIssue = true
        pushIssue(row, lineNo, 'missing_payee_name', '지급처 이름이 비어 있습니다.')
      }
      if (!hasValidTin(row.payee_tax_id)) {
        warningCounts.missingPayeeTaxId += 1
        rowHasIssue = true
        pushIssue(row, lineNo, 'missing_payee_tax_id', '지급처 TIN(13자리)이 없거나 형식이 올바르지 않습니다.')
      }
      if (!String(row.income_type || '').trim()) {
        warningCounts.missingIncomeType += 1
        rowHasIssue = true
        pushIssue(row, lineNo, 'missing_income_type', '소득유형(income_type)이 비어 있습니다.')
      }
      if (!String(row.certificate_no || '').trim()) {
        warningCounts.missingCertificateNo += 1
        rowHasIssue = true
        pushIssue(row, lineNo, 'missing_certificate_no', '원천세 증명서 번호(certificate_no)가 비어 있습니다.')
      }
      const rate = Number(row.wht_rate)
      if (!(rate > 0 && rate <= 35)) {
        warningCounts.invalidWhtRate += 1
        rowHasIssue = true
        pushIssue(row, lineNo, 'invalid_wht_rate', '원천세율(wht_rate)이 비정상 범위입니다. (0~35%)')
      }
      const wht = Number(row.wht_amount)
      if (!(wht > 0)) {
        warningCounts.nonPositiveWithheldAmount += 1
        rowHasIssue = true
        pushIssue(row, lineNo, 'non_positive_wht_amount', '원천세액(wht_amount)이 0 이하입니다.')
      }
      if (rowHasIssue) invalidRowCount += 1
    })

    return NextResponse.json(
      {
        period,
        filingForm: formHint,
        totalRows: filteredRows.length,
        validRows: Math.max(0, filteredRows.length - invalidRowCount),
        warningCounts,
        sampleWarnings,
        issues,
      },
      { headers }
    )
  } catch (e) {
    console.error('validatePnd3Pnd53:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
