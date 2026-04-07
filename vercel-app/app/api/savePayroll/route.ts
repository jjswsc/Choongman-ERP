import { NextRequest, NextResponse } from 'next/server'
import { postExpenseAccrualJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate, supabaseUpsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { parseOr400, savePayrollSchema } from '@/lib/api-validate'

const CHUNK = 50

type PayrollExpenseAccrualRow = {
  id?: number
  payee_code?: string
  status?: string
}

type AccountSubjectRow = {
  id?: number
  code?: string
  name?: string
  type?: string
}

export interface PayrollSaveRow {
  employeeId?: number
  employeeCode?: string
  store: string
  name: string
  dept?: string
  role?: string
  salary?: number
  posAllow?: number
  hazAllow?: number
  diligenceAllow?: number
  birthBonus?: number
  holidayPay?: number
  splBonus?: number
  ot15?: number
  ot20?: number
  ot30?: number
  otAmt?: number
  lateMin?: number
  lateDed?: number
  earlyMin?: number
  earlyDed?: number
  sso?: number
  tax?: number
  otherDed?: number
  netPay?: number
  status?: string
}

function toMonthDate(monthStr: string, useLastDay: boolean): string {
  const base = new Date(`${monthStr}-01T12:00:00`)
  if (Number.isNaN(base.getTime())) return `${monthStr}-01`
  if (!useLastDay) return `${monthStr}-01`
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  return last.toISOString().slice(0, 10)
}

function normalizeToken(src: string): string {
  return String(src || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'na'
}

function buildPayrollPayeeCode(monthStr: string, store: string, name: string, employeeToken?: string): string {
  const emp = normalizeToken(employeeToken || '')
  const suffix = emp && emp !== 'na' ? `-${emp}` : ''
  const base = `payroll-${monthStr}-${normalizeToken(store)}-${normalizeToken(name)}${suffix}`
  return `${base}::wm::expense`
}

/** DB unique 가 (month, lower(trim(store)), employee_id) 인 경우 PostgREST on_conflict=month,store,employee_id 와 불일치 → upsert 가 INSERT 만 시도해 23505 발생 */
function normalizePayrollStoreKey(s: unknown): string {
  return String(s || '')
    .trim()
    .toLowerCase()
}

/**
 * payroll_records: employee_id 있으면 월+직원 id 로 기존 행 조회 후 id 기준 갱신(매장명 대소문자·공백 정규화 키 일치).
 * 없으면 month,store,name upsert.
 */
async function savePayrollRecordsChunk(monthStr: string, chunk: Record<string, unknown>[]) {
  const withEid: Record<string, unknown>[] = []
  const withoutEid: Record<string, unknown>[] = []
  for (const r of chunk) {
    const eid = r.employee_id
    if (eid != null && Number.isFinite(Number(eid)) && Number(eid) > 0) {
      withEid.push(r)
    } else {
      withoutEid.push(r)
    }
  }

  if (withEid.length > 0) {
    const dedup = new Map<string, Record<string, unknown>>()
    for (const r of withEid) {
      const eid = Math.floor(Number(r.employee_id))
      const sk = normalizePayrollStoreKey(r.store)
      dedup.set(`${sk}|${eid}`, r)
    }
    const rowsToSave = [...dedup.values()]
    const eidSet = [...new Set(rowsToSave.map((r) => Math.floor(Number(r.employee_id))))]
    const filter = `month=eq.${encodeURIComponent(monthStr)}&employee_id=in.(${eidSet.join(',')})`
    const existing = (await supabaseSelectFilter('payroll_records', filter, {
      select: 'id,month,store,employee_id',
      limit: Math.max(200, eidSet.length * 4),
    })) as { id: number; month: string; store: string; employee_id: number }[] | null

    const existingIdByKey = new Map<string, number>()
    for (const ex of existing || []) {
      const m = String(ex.month || '').slice(0, 7)
      if (m !== monthStr) continue
      const eid = Math.floor(Number(ex.employee_id))
      if (!Number.isFinite(eid) || eid <= 0) continue
      const key = `${normalizePayrollStoreKey(ex.store)}|${eid}`
      const id = Number(ex.id)
      if (!Number.isFinite(id) || id <= 0) continue
      const prev = existingIdByKey.get(key)
      if (prev == null || id < prev) existingIdByKey.set(key, id)
    }

    for (const r of rowsToSave) {
      const eid = Math.floor(Number(r.employee_id))
      const key = `${normalizePayrollStoreKey(r.store)}|${eid}`
      const id = existingIdByKey.get(key)
      if (id != null && id > 0) {
        await supabaseUpdate('payroll_records', id, r)
      } else {
        await supabaseInsert('payroll_records', r)
      }
    }
  }

  if (withoutEid.length > 0) {
    try {
      await supabaseUpsert('payroll_records', withoutEid, 'month,store,name')
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/23505|duplicate|unique/i.test(em)) {
        for (const r of withoutEid) {
          const name = String(r.name || '').trim()
          const store = String(r.store || '').trim()
          const cand = (await supabaseSelectFilter(
            'payroll_records',
            `month=eq.${encodeURIComponent(monthStr)}&name=eq.${encodeURIComponent(name)}`,
            { select: 'id,store', limit: 30 }
          )) as { id: number; store: string }[] | null
          const hit = (cand || []).find(
            (x) => normalizePayrollStoreKey(x.store) === normalizePayrollStoreKey(store)
          )
          if (hit?.id) await supabaseUpdate('payroll_records', hit.id, r)
          else await supabaseInsert('payroll_records', r)
        }
      } else {
        throw e
      }
    }
  }
}

async function resolvePayrollAccountSubject(): Promise<{ id: number | null; code: string; name: string }> {
  try {
    const rows = (await supabaseSelectFilter('account_subjects', 'type=eq.expense', {
      select: 'id,code,name,type,is_header',
      order: 'sort_order.asc,code.asc',
      limit: 400,
    })) as (AccountSubjectRow & { is_header?: boolean | null })[] | null
    const list = rows || []
    const picked = list.find((r) => {
      if (r.is_header === true) return false
      const text = `${String(r.code || '')} ${String(r.name || '')}`.toLowerCase()
      return text.includes('급여') || text.includes('salary') || text.includes('wage')
    })
    if (picked?.id) {
      return {
        id: Number(picked.id),
        code: String(picked.code || '5520'),
        name: String(picked.name || '인건비'),
      }
    }
  } catch (_) {}
  return { id: null, code: '5520', name: '인건비' }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const { auth } = authResult

  try {
    const body = await request.json()
    const bodyForValidation = {
      ...body,
      list: body.list || body.rows || [],
      month: (body.month || body.monthStr || '').slice(0, 7),
    }
    const validated = parseOr400(savePayrollSchema, bodyForValidation, headers)
    if (validated.errorResponse) {
      validated.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return validated.errorResponse
    }
    const { list: rawList, month: m, monthStr: ms } = validated.parsed
    const monthStr = (m || ms || '').slice(0, 7)
    let list = rawList as unknown as PayrollSaveRow[]
    const userStore = (auth.store || '').trim()
    const userRole = (auth.role || '').toLowerCase()
    if (userRole.includes('manager') && userStore) {
      list = list.filter((r) => String(r.store || '').trim() === userStore)
    }

    const rows: Record<string, unknown>[] = list.map((r) => ({
      month: monthStr,
      store: String(r.store || '').trim(),
      name: String(r.name || '').trim(),
      employee_id:
        r.employeeId != null && Number.isFinite(Number(r.employeeId)) && Number(r.employeeId) > 0
          ? Math.floor(Number(r.employeeId))
          : null,
      employee_code: String(r.employeeCode || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 5),
      dept: String(r.dept || '').trim(),
      role: String(r.role || '').trim(),
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.posAllow) || 0,
      haz_allow: Number(r.hazAllow) || 0,
      diligence_allow: Number(r.diligenceAllow) || 0,
      birth_bonus: Number(r.birthBonus) || 0,
      holiday_pay: Number(r.holidayPay) ?? 0,
      spl_bonus: Number(r.splBonus) || 0,
      ot_15: Number(r.ot15) || 0,
      ot_20: Number(r.ot20) || 0,
      ot_30: Number(r.ot30) || 0,
      ot_amt: Number(r.otAmt) || 0,
      late_min: Number(r.lateMin) || 0,
      late_ded: Number(r.lateDed) || 0,
      early_min: Number(r.earlyMin) ?? 0,
      early_ded: Number(r.earlyDed) ?? 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.otherDed) || 0,
      net_pay: Number(r.netPay) || 0,
      status: String(r.status || '확정').trim(),
    }))

    for (let j = 0; j < rows.length; j += CHUNK) {
      const chunk = rows.slice(j, j + CHUNK)
      try {
        await savePayrollRecordsChunk(monthStr, chunk)
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (/employee_id|employee_code|42703|column/i.test(em)) {
          const fallbackChunk = chunk.map((r) => {
            const { employee_id: _eid, employee_code: _ecode, ...rest } = r
            return rest
          })
          await supabaseUpsert('payroll_records', fallbackChunk, 'month,store,name')
        } else {
          throw e
        }
      }
    }

    const expenseSubject = await resolvePayrollAccountSubject()
    if (expenseSubject.id != null) {
      const hdr = await assertAccountSubjectNotHeader(expenseSubject.id)
      if (!hdr.ok) {
        return NextResponse.json({ success: false, msg: hdr.message }, { status: hdr.status, headers })
      }
    }
    const expenseDate = toMonthDate(monthStr, false)
    const dueDate = toMonthDate(monthStr, true)
    const monthlyPrefix = `payroll-${monthStr}-`
    const existingAccrualRows = (await supabaseSelectFilter(
      'expense_accruals',
      `payee_code=ilike.${encodeURIComponent(`${monthlyPrefix}%::wm::expense`)}`,
      { select: 'id,payee_code,status', limit: 5000 }
    )) as PayrollExpenseAccrualRow[] | null
    const existingByPayeeCode = new Map<string, PayrollExpenseAccrualRow>()
    for (const row of existingAccrualRows || []) {
      const key = String(row.payee_code || '').trim()
      if (key) existingByPayeeCode.set(key, row)
    }

    let createdAccrualCount = 0
    let updatedAccrualCount = 0
    for (const r of list) {
      const netPay = Math.max(0, Number(r.netPay) || 0)
      const store = String(r.store || '').trim()
      const name = String(r.name || '').trim()
      const employeeCode = String(r.employeeCode || '').trim()
      const employeeId =
        r.employeeId != null && Number.isFinite(Number(r.employeeId)) ? Math.floor(Number(r.employeeId)) : 0
      const employeeToken = employeeCode || (employeeId > 0 ? `id${employeeId}` : '')
      if (!store || !name || netPay <= 0) continue

      const payeeCode = buildPayrollPayeeCode(monthStr, store, name, employeeToken)
      const memo = `[PAYROLL] ${monthStr} ${store} ${name} 급여`
      const existing = existingByPayeeCode.get(payeeCode)
      const existingId = Number(existing?.id || 0)
      const existingStatus = String(existing?.status || '').toLowerCase()
      if (existingId > 0) {
        if (existingStatus === 'paid') continue
        await supabaseUpdate('expense_accruals', existingId, {
          amount: netPay,
          expense_date: expenseDate,
          due_date: dueDate,
          memo,
          store_name: store,
          account_subject_id: expenseSubject.id,
          status: existingStatus === 'approved' ? 'approved' : 'planned',
          updated_at: new Date().toISOString(),
        })
        updatedAccrualCount++
        continue
      }

      const inserted = (await supabaseInsert('expense_accruals', {
        payee_code: payeeCode,
        payee_name: name,
        amount: netPay,
        expense_date: expenseDate,
        due_date: dueDate,
        memo,
        store_name: store,
        account_subject_id: expenseSubject.id,
        created_by: auth.name || null,
        status: 'planned',
      })) as { id?: number }[]
      const expenseAccrualId = Number(inserted?.[0]?.id || 0)
      if (!expenseAccrualId) continue

      await supabaseInsert('payable_transactions', {
        vendor_code: `EMP:${name}`.slice(0, 120),
        amount: netPay,
        ref_type: 'Expense',
        ref_id: null,
        trans_date: expenseDate,
        memo: `급여 발생 ${monthStr} ${name}`.slice(0, 200),
        expense_accrual_id: expenseAccrualId,
        account_subject_id: expenseSubject.id,
        expense_date: expenseDate,
        due_date: dueDate,
      })

      try {
        await postExpenseAccrualJournal({
          expenseAccrualId,
          accountingDate: expenseDate,
          amountAbs: netPay,
          expenseAccountCode: expenseSubject.code,
          expenseAccountName: expenseSubject.name,
          expenseAccountSubjectId: expenseSubject.id ?? null,
          memo,
          storeName: store || undefined,
          postedBy: auth.name || undefined,
        })
      } catch (postingErr) {
        console.error('savePayroll posting:', postingErr)
      }

      createdAccrualCount++
    }

    return NextResponse.json(
      {
        success: true,
        msg: `${monthStr} 급여 내역이 DB에 저장되었습니다.`,
        payrollExpenseSync: {
          created: createdAccrualCount,
          updated: updatedAccrualCount,
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('savePayroll:', e)
    return NextResponse.json(
      { success: false, msg: '저장 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
