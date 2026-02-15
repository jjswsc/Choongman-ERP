/**
 * employees_rows.csv → Supabase employees (기존 전체 삭제 후 새로 입력)
 * POST body: { csv: string } 또는 FormData (file)
 *
 * CSV 컬럼: id, store, name, nick, phone, job, birth, nation, join_date, resign_date, sal_type, sal_amt, password, role, email, photo, grade, created_at, annual_leave_days, bank_name, account_number, position_allowance
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsertMany,
  supabaseSelect,
} from '@/lib/supabase-server'

/** RFC 4180: 따옴표 안의 줄바꿈, "" 처리 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\n' || c === '\r') {
        row.push(field)
        field = ''
        if (row.some((x) => x !== '')) rows.push(row)
        row = []
        if (c === '\r' && next === '\n') i++
      } else {
        field += c
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((x) => x !== '')) rows.push(row)
  }
  return rows
}

/** M/D/YYYY 또는 D/M/YYYY → YYYY-MM-DD (Postgres DATE) */
function parseDate(val: string): string | null {
  const s = String(val || '').trim()
  if (!s) return null
  const parts = s.split(/[/\-.]/)
  if (parts.length !== 3) return null
  let m = parseInt(parts[0], 10)
  let d = parseInt(parts[1], 10)
  const y = parseInt(parts[2], 10)
  if (Number.isNaN(m) || Number.isNaN(d) || Number.isNaN(y) || y < 1900 || y > 2100) return null
  if (m > 12) {
    [d, m] = [m, d]
  }
  if (d > 31 || m > 12 || m < 1 || d < 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let csvText = ''
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file') as File | null
      if (!file) {
        return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
      }
      csvText = await file.text()
    } else {
      const body = (await request.json()) as { csv?: string }
      csvText = String(body.csv || '')
    }
    if (!csvText.trim()) {
      return NextResponse.json({ success: false, message: 'CSV 내용이 비어 있습니다.' }, { headers })
    }

    const rows = parseCsv(csvText)
    if (rows.length < 2) {
      return NextResponse.json({ success: false, message: '헤더 외 데이터가 없습니다.' }, { headers })
    }

    const header = rows[0].map((h) => h.trim().toLowerCase())
    const idx = (name: string) => {
      const i = header.indexOf(name.toLowerCase())
      return i >= 0 ? i : -1
    }
    const col = {
      store: idx('store'),
      name: idx('name'),
      nick: idx('nick'),
      phone: idx('phone'),
      job: idx('job'),
      birth: idx('birth'),
      nation: idx('nation'),
      join_date: idx('join_date'),
      resign_date: idx('resign_date'),
      sal_type: idx('sal_type'),
      sal_amt: idx('sal_amt'),
      password: idx('password'),
      role: idx('role'),
      email: idx('email'),
      photo: idx('photo'),
      grade: idx('grade'),
      annual_leave_days: idx('annual_leave_days'),
      bank_name: idx('bank_name'),
      account_number: idx('account_number'),
      position_allowance: idx('position_allowance'),
    }
    if (col.store < 0 || col.name < 0) {
      return NextResponse.json({ success: false, message: '필수 컬럼 store 또는 name이 없습니다.' }, { headers })
    }

    const employees: Record<string, unknown>[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const store = String(r[col.store] ?? '').trim()
      const name = String(r[col.name] ?? '').trim()
      if (!store || !name) continue

      const nick = col.nick >= 0 ? String(r[col.nick] ?? '').trim() : ''
      const phone = col.phone >= 0 ? String(r[col.phone] ?? '').trim() : ''
      const job = col.job >= 0 ? String(r[col.job] ?? '').trim() : ''
      const nation = col.nation >= 0 ? String(r[col.nation] ?? '').trim() : ''
      const salType = col.sal_type >= 0 ? String(r[col.sal_type] ?? '').trim() || 'Monthly' : 'Monthly'
      const password = col.password >= 0 ? String(r[col.password] ?? '').trim() || '' : ''
      const role = col.role >= 0 ? String(r[col.role] ?? '').trim() || 'Staff' : 'Staff'
      const email = col.email >= 0 ? String(r[col.email] ?? '').trim() : ''
      const photo = col.photo >= 0 ? String(r[col.photo] ?? '').trim() : ''
      const grade = col.grade >= 0 ? String(r[col.grade] ?? '').trim() : ''
      const bankName = col.bank_name >= 0 ? String(r[col.bank_name] ?? '').trim() : ''
      const accountNumber = col.account_number >= 0 ? String(r[col.account_number] ?? '').trim() : ''

      let salAmt = 0
      if (col.sal_amt >= 0) {
        const v = String(r[col.sal_amt] ?? '').replace(/,/g, '').trim()
        const n = parseFloat(v)
        if (!Number.isNaN(n)) salAmt = n
      }
      let annualLeave = 15
      if (col.annual_leave_days >= 0) {
        const v = String(r[col.annual_leave_days] ?? '').replace(/,/g, '').trim()
        const n = parseFloat(v)
        if (v && !Number.isNaN(n)) annualLeave = n
      }
      let positionAllowance = 0
      if (col.position_allowance >= 0) {
        const v = String(r[col.position_allowance] ?? '').replace(/,/g, '').trim()
        const n = parseFloat(v)
        if (!Number.isNaN(n)) positionAllowance = n
      }

      const birth = col.birth >= 0 ? parseDate(String(r[col.birth] ?? '')) : null
      const joinDate = col.join_date >= 0 ? parseDate(String(r[col.join_date] ?? '')) : null
      const resignDate = col.resign_date >= 0 ? parseDate(String(r[col.resign_date] ?? '')) : null

      employees.push({
        store,
        name,
        nick,
        phone,
        job,
        birth,
        nation,
        join_date: joinDate,
        resign_date: resignDate,
        sal_type: salType,
        sal_amt: salAmt,
        password,
        role,
        email,
        annual_leave_days: annualLeave,
        bank_name: bankName,
        account_number: accountNumber,
        position_allowance: positionAllowance,
        grade,
        photo,
      })
    }

    if (employees.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 행이 없습니다.' }, { headers })
    }

    // (store, name) 중복 시 마지막 행 유지
    const empMap = new Map<string, Record<string, unknown>>()
    for (const e of employees) {
      const key = `${String(e.store)}|||${String(e.name)}`
      empMap.set(key, e)
    }
    const uniqueEmps = Array.from(empMap.values())

    // 기존 직원 전체 삭제
    const existing = (await supabaseSelect('employees', { limit: 1 })) as { id?: number }[] | null
    if (existing && existing.length > 0) {
      await supabaseDeleteByFilter('employees', 'id=gte.0')
    }

    // 배치로 insert (100건씩)
    const chunkSize = 100
    for (let j = 0; j < uniqueEmps.length; j += chunkSize) {
      const chunk = uniqueEmps.slice(j, j + chunkSize)
      await supabaseInsertMany('employees', chunk)
    }

    return NextResponse.json(
      { success: true, message: `기존 삭제 후 ${uniqueEmps.length}명 등록 완료`, count: uniqueEmps.length },
      { headers }
    )
  } catch (e) {
    console.error('importEmployeesFromCsv:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '가져오기 실패' },
      { headers }
    )
  }
}
