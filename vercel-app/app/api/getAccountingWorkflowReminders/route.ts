import { NextRequest, NextResponse } from 'next/server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { THAI_FILING_DEFINITIONS, type ThaiFilingType } from '@/lib/thai-filing-scope'
import { requireAuth } from '@/lib/verify-auth'

type WorkflowStatusRow = {
  filing_type?: string | null
  status?: string | null
  updated_at?: string | null
  store_scope?: string | null
}

type ReminderSeverity = 'info' | 'warn' | 'critical'

type ReminderRow = {
  filingType: ThaiFilingType
  filingLabelKo: string
  periodType: 'monthly' | 'half_year' | 'annual'
  yearMonth: string
  dueDateBangkok: string
  daysToDue: number
  severity: ReminderSeverity
  status: string
  messageKo: string
}

type WhtLedgerRow = {
  id?: number | null
  payee_name?: string | null
  payee_tax_id?: string | null
  form_hint?: string | null
  memo?: string | null
}

const WHT_REMINDER_SCAN_MAX_ROWS = 1_000_000

function shiftYearMonth(ym: string, deltaMonths: number): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ''
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  const d = new Date(y, m - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dayDiffBangkok(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00+07:00`)
  const b = Date.parse(`${toYmd}T00:00:00+07:00`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.floor((b - a) / (24 * 60 * 60 * 1000))
}

function filingPeriodType(filingType: ThaiFilingType): 'monthly' | 'half_year' | 'annual' {
  if (filingType === 'cit_ppnd50') return 'half_year'
  if (filingType === 'dbd_annual_fs') return 'annual'
  return 'monthly'
}

function workflowFilingType(filingType: ThaiFilingType): string {
  if (filingType === 'sso_contribution') return 'sso'
  return filingType
}

function computeDueYmd(filingType: ThaiFilingType, yearMonth: string): string {
  const y = Number(yearMonth.slice(0, 4))
  const m = Number(yearMonth.slice(5, 7))
  if (filingType === 'wht_pnd54') {
    const d = new Date(y, m, 7) // 다음달 7일 (해외지급 원천세 일반 기준)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-07`
  }
  if (
    filingType === 'vat_pp30' ||
    filingType === 'vat_pp36' ||
    filingType === 'wht_ppnd' ||
    filingType === 'sso_contribution'
  ) {
    const d = new Date(y, m, 15) // 다음달 15일
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`
  }
  if (filingType === 'cit_ppnd50') {
    const d = new Date(y, m + 1, 30) // 간략 기준: 반기/연말 종료 후 약 60일
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (filingType === 'dbd_annual_fs') {
    return `${y + 1}-05-31`
  }
  return `${yearMonth}-28`
}

function severityFromDays(daysToDue: number): ReminderSeverity {
  if (daysToDue < -7) return 'critical'
  if (daysToDue <= 7) return 'warn'
  return 'info'
}

function isPayrollWhtLedgerRow(row: WhtLedgerRow): boolean {
  const memo = String(row.memo || '')
  if (memo.includes('[AUTO:PAYROLL_RECORD_WHT:')) return true
  const form = String(row.form_hint || '').toLowerCase()
  return form.includes('pnd1') || form.includes('ภ.ง.ด.1')
}

function hasValidTin(v: unknown): boolean {
  const digits = String(v || '').replace(/\D/g, '')
  return digits.length === 13
}

function isMissingPeriodColumnsError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('period_type') || msg.includes('period_key') || msg.includes('42703')
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
  const yearMonth = String(searchParams.get('yearMonth') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || '').trim() || 'All'

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ success: false, error: 'INVALID_YEAR_MONTH', rows: [] }, { status: 400, headers })
  }

  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN', rows: [] }, { status: 403, headers })
    }
    throw e
  }

  const todayYmd = getBangkokTodayDateString()
  const periods = [yearMonth, shiftYearMonth(yearMonth, -1)]
  const reminders: ReminderRow[] = []

  for (const ym of periods) {
    if (!ym) continue
    for (const filing of THAI_FILING_DEFINITIONS) {
      const filingType = filing.id
      const workflowType = workflowFilingType(filingType)
      const periodType = filingPeriodType(filingType)
      const dueYmd = computeDueYmd(filingType, ym)
      const daysToDue = dayDiffBangkok(todayYmd, dueYmd)
      if (daysToDue > 14) continue

      let status = 'todo'
      try {
        const rows = (await supabaseSelectFilter(
          'accounting_filing_workflow_status',
          [
            `period_type=eq.${encodeURIComponent(periodType)}`,
            `period_key=eq.${encodeURIComponent(periodType === 'monthly' ? ym : ym.slice(0, 4))}`,
            `filing_type=eq.${encodeURIComponent(workflowType)}`,
            `store_scope=eq.${encodeURIComponent(storeFilter)}`,
          ].join('&'),
          { select: 'status,updated_at,store_scope', order: 'updated_at.desc,id.desc', limit: 1 }
        )) as WorkflowStatusRow[] | null
        status = String(rows?.[0]?.status || 'todo')
      } catch (e) {
        if (!isMissingPeriodColumnsError(e)) throw e
        const fallbackRows = (await supabaseSelectFilter(
          'accounting_filing_workflow_status',
          `year_month=eq.${encodeURIComponent(ym)}&filing_type=eq.${encodeURIComponent(workflowType)}&store_scope=eq.${encodeURIComponent(storeFilter)}`,
          { select: 'status,updated_at,store_scope', order: 'updated_at.desc,id.desc', limit: 1 }
        )) as WorkflowStatusRow[] | null
        status = String(fallbackRows?.[0]?.status || 'todo')
      }

      if (status === 'done') continue
      const severity = severityFromDays(daysToDue)
      const messageKo =
        daysToDue < 0
          ? `${filing.labelKo}: 기한이 ${Math.abs(daysToDue)}일 지났습니다. (${dueYmd})`
          : `${filing.labelKo}: 마감까지 ${daysToDue}일 남았습니다. (${dueYmd})`
      reminders.push({
        filingType,
        filingLabelKo: filing.labelKo,
        periodType,
        yearMonth: ym,
        dueDateBangkok: dueYmd,
        daysToDue,
        severity,
        status,
        messageKo,
      })

      if (filingType === 'wht_ppnd') {
        const whtRows = (await supabaseSelectFilterAllPages(
          'withholding_tax_ledger_entries',
          `tax_month=eq.${encodeURIComponent(ym)}`,
          {
            select: 'id,payee_name,payee_tax_id,form_hint,memo',
            pageSize: 8000,
            maxRows: WHT_REMINDER_SCAN_MAX_ROWS,
          }
        )) as WhtLedgerRow[] | null
        const payrollRows = (whtRows || []).filter(isPayrollWhtLedgerRow)
        const missingTinRows = payrollRows.filter((r) => !hasValidTin(r.payee_tax_id))
        if (missingTinRows.length > 0) {
          const empSet = new Set(
            missingTinRows.map((r) => String(r.payee_name || '').trim().toLowerCase()).filter(Boolean)
          )
          const sample = missingTinRows
            .slice(0, 3)
            .map((r) => String(r.payee_name || '').trim())
            .filter(Boolean)
            .join(', ')
          reminders.push({
            filingType,
            filingLabelKo: `${filing.labelKo} (급여 TIN 점검)`,
            periodType,
            yearMonth: ym,
            dueDateBangkok: dueYmd,
            daysToDue,
            severity: missingTinRows.length >= 3 ? 'critical' : 'warn',
            status,
            messageKo: `급여 원천 TIN 누락 ${missingTinRows.length}건 / 직원 ${empSet.size}명${
              sample ? ` (예: ${sample})` : ''
            }`,
          })
        }
      }
    }
  }

  reminders.sort((a, b) => a.daysToDue - b.daysToDue)
  return NextResponse.json(
    {
      success: true,
      bangkokToday: todayYmd,
      rows: reminders.slice(0, 50),
      summary: {
        critical: reminders.filter((r) => r.severity === 'critical').length,
        warn: reminders.filter((r) => r.severity === 'warn').length,
        info: reminders.filter((r) => r.severity === 'info').length,
      },
    },
    { headers }
  )
}
