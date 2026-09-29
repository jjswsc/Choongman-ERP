/**
 * 직원 CSV 가져오기.
 * 화면「CSV 보내기」헤더(Employee code, Store, …)와 DB 컬럼명(employee_code, store, …)을 둘 다 읽는다.
 * 기존 행은 지우지 않고, 직원 코드 또는 매장+이름으로 맞춰 수정하고 없는 사람만 추가한다.
 * PIN(password)은 CSV에 값이 있을 때만 바꾼다.
 */
import { normalizeEmployeeNameFields } from '@/lib/employee-display-name'
import { getEmployeeJobOptionLabel } from '@/lib/employee-job-catalog'
import { isEmployeeCodeFormat, normalizeEmployeeCodeInput } from '@/lib/employee-code'

export type EmployeeCsvField =
  | 'store'
  | 'name'
  | 'name_title'
  | 'nick'
  | 'employee_code'
  | 'phone'
  | 'job'
  | 'birth'
  | 'nation'
  | 'join_date'
  | 'resign_date'
  | 'sal_type'
  | 'sal_amt'
  | 'salary'
  | 'password'
  | 'role'
  | 'email'
  | 'photo'
  | 'grade'
  | 'annual_leave_days'
  | 'bank_name'
  | 'account_number'
  | 'position_allowance'
  | 'ignore'

const HEADER_ALIASES: Record<string, EmployeeCsvField> = {
  store: 'store',
  매장: 'store',
  สาขา: 'store',
  name: 'name',
  이름: 'name',
  ชื่อ: 'name',
  'name title': 'name_title',
  name_title: 'name_title',
  nick: 'nick',
  nickname: 'nick',
  닉네임: 'nick',
  ชื่อเล่น: 'nick',
  'employee code': 'employee_code',
  employee_code: 'employee_code',
  employee: 'employee_code',
  'emp code': 'employee_code',
  '직원 코드': 'employee_code',
  직원코드: 'employee_code',
  รหัสพนักงาน: 'employee_code',
  phone: 'phone',
  tel: 'phone',
  mobile: 'phone',
  job: 'job',
  직무: 'job',
  หน้าที่: 'job',
  birth: 'birth',
  birthday: 'birth',
  nation: 'nation',
  nationality: 'nation',
  국적: 'nation',
  สัญชาติ: 'nation',
  'join date': 'join_date',
  join_date: 'join_date',
  입사일: 'join_date',
  วันที่เข้า: 'join_date',
  'resign date': 'resign_date',
  resign_date: 'resign_date',
  'sal type': 'sal_type',
  sal_type: 'sal_type',
  'sal amt': 'sal_amt',
  sal_amt: 'sal_amt',
  salary: 'salary',
  급여: 'salary',
  เงินเดือน: 'salary',
  password: 'password',
  pin: 'password',
  pw: 'password',
  role: 'role',
  권한: 'role',
  บทบาท: 'role',
  email: 'email',
  photo: 'photo',
  grade: 'grade',
  등급: 'grade',
  เกรด: 'grade',
  'annual leave days': 'annual_leave_days',
  annual_leave_days: 'annual_leave_days',
  'bank name': 'bank_name',
  bank_name: 'bank_name',
  'account number': 'account_number',
  account_number: 'account_number',
  'position allowance': 'position_allowance',
  position_allowance: 'position_allowance',
  age: 'ignore',
  나이: 'ignore',
  อายุ: 'ignore',
}

/** null = 열이 없거나 칸이 비어 있어 기존 값을 유지 */
export type ParsedEmployeeCsvRow = {
  store: string
  name: string
  nameTitle: string
  nick: string | null
  /** 형식에 맞는 코드. 없거나 형식이 아니면 '' */
  employeeCode: string
  /** 칸에 뭔가 있었는데 형식(영문2+숫자3)이 아님 */
  employeeCodeInvalid: boolean
  phone: string | null
  job: string | null
  birth: string | null
  nation: string | null
  joinDate: string | null
  resignDate: string | null
  salType: string | null
  salAmt: number | null
  password: string | null
  role: string | null
  email: string | null
  photo: string | null
  grade: string | null
  annualLeaveDays: number | null
  bankName: string | null
  accountNumber: string | null
  positionAllowance: number | null
}

export type ExistingEmployeeForCsv = {
  id: number
  store: string
  name: string
  nameTitle: string
  employeeCode: string
  role: string
  deleted: boolean
}

export type EmployeeCsvMergePlan = {
  updates: { id: number; patch: Record<string, unknown> }[]
  inserts: Record<string, unknown>[]
  /** 형식 불일치·이미 다른 사람이 쓰는 코드 */
  skippedCodes: number
  /** 같은 매장+이름이 여러 명이라 맞추지 못한 행 */
  skippedRows: number
}

function normHeader(h: string): string {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
}

function isBlankCell(raw: string): boolean {
  const s = String(raw || '').trim()
  if (!s) return true
  return s === '-' || s === '—' || s === '–' || s === 'n/a' || s === 'na'
}

/** RFC 4180 */
export function parseEmployeeCsvTable(text: string): string[][] {
  const src = String(text || '').replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
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
    } else if (c === '"') {
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
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((x) => x !== '')) rows.push(row)
  }
  return rows
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function fmtYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseEmployeeCsvDate(val: string): string | null {
  const s = String(val || '').trim()
  if (isBlankCell(s)) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (validYmd(y, m, d)) return fmtYmd(y, m, d)
    return null
  }
  const parts = s.split(/[/\-.]/)
  if (parts.length !== 3) return null
  let m = parseInt(parts[0], 10)
  let d = parseInt(parts[1], 10)
  const y = parseInt(parts[2], 10)
  if (Number.isNaN(m) || Number.isNaN(d) || Number.isNaN(y)) return null
  if (m > 12) [d, m] = [m, d]
  if (!validYmd(y, m, d)) return null
  return fmtYmd(y, m, d)
}

function canonicalSalType(raw: string): string {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return ''
  if (s === 'monthly' || s === '월급' || s === 'รายเดือน' || s === 'month') return 'Monthly'
  if (s === 'hourly' || s === '시급' || s === 'รายชั่วโมง' || s === 'hour') return 'Hourly'
  if (s === 'part-time' || s === 'parttime' || s === 'part time' || s === '파트타임' || s === 'พาร์ทไทม์' || s === 'p/t')
    return 'Part-time'
  return ''
}

export function parseEmployeeSalaryCell(raw: string): { amt: number | null; type: string } {
  const s = String(raw || '').trim()
  if (isBlankCell(s)) return { amt: null, type: '' }
  const m = s.match(/^([\d,]+(?:\.\d+)?)\s*(.*)$/)
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''))
    const type = canonicalSalType(m[2])
    return { amt: Number.isFinite(n) ? n : null, type }
  }
  return { amt: null, type: canonicalSalType(s) }
}

function canonicalRole(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  const lo = s.toLowerCase()
  if (lo === 'staff') return 'Staff'
  if (lo === 'manager') return 'Manager'
  if (lo === 'franchisee') return 'Franchisee'
  if (lo === 'officer') return 'Officer'
  if (lo === 'director') return 'Director'
  return s
}

function parseGradeCell(raw: string): string | null {
  const s = String(raw || '').trim()
  if (isBlankCell(s)) return null
  const left = s.split('/')[0].trim()
  if (/^[SABCF]$/i.test(left)) return left.toUpperCase()
  if (s.includes('/')) return null
  return s.slice(0, 20)
}

function cell(r: string[], idx: number): string {
  if (idx < 0) return ''
  return String(r[idx] ?? '')
}

function present(idx: number, raw: string): string | null {
  if (idx < 0) return null
  const s = String(raw || '').trim()
  if (isBlankCell(s)) return null
  return s
}

export function parseEmployeeCsv(text: string): { rows: ParsedEmployeeCsvRow[]; error: string | null } {
  const table = parseEmployeeCsvTable(text)
  if (table.length < 2) return { rows: [], error: '헤더 외 데이터가 없습니다.' }
  const header = table[0].map(normHeader)
  const idxOf = (field: EmployeeCsvField): number => {
    for (let i = 0; i < header.length; i++) {
      const mapped = HEADER_ALIASES[header[i]]
      if (mapped === field) return i
    }
    return -1
  }
  const col = {
    store: idxOf('store'),
    name: idxOf('name'),
    name_title: idxOf('name_title'),
    nick: idxOf('nick'),
    employee_code: idxOf('employee_code'),
    phone: idxOf('phone'),
    job: idxOf('job'),
    birth: idxOf('birth'),
    nation: idxOf('nation'),
    join_date: idxOf('join_date'),
    resign_date: idxOf('resign_date'),
    sal_type: idxOf('sal_type'),
    sal_amt: idxOf('sal_amt'),
    salary: idxOf('salary'),
    password: idxOf('password'),
    role: idxOf('role'),
    email: idxOf('email'),
    photo: idxOf('photo'),
    grade: idxOf('grade'),
    annual_leave_days: idxOf('annual_leave_days'),
    bank_name: idxOf('bank_name'),
    account_number: idxOf('account_number'),
    position_allowance: idxOf('position_allowance'),
  }
  if (col.store < 0 || col.name < 0) {
    return { rows: [], error: '필수 컬럼 store 또는 name이 없습니다.' }
  }

  const rows: ParsedEmployeeCsvRow[] = []
  for (let i = 1; i < table.length; i++) {
    const r = table[i]
    const store = String(cell(r, col.store)).trim()
    const rawName = String(cell(r, col.name)).trim()
    const rawTitle = col.name_title >= 0 ? String(cell(r, col.name_title)).trim() : ''
    const { name, nameTitle } = normalizeEmployeeNameFields(rawName, rawTitle)
    if (!store || !name || isBlankCell(store) || isBlankCell(name)) continue

    const codeRaw = present(col.employee_code, cell(r, col.employee_code))
    const codeNorm = codeRaw ? normalizeEmployeeCodeInput(codeRaw) : ''
    const employeeCode = codeNorm && isEmployeeCodeFormat(codeNorm) ? codeNorm : ''
    const employeeCodeInvalid = !!codeRaw && !employeeCode

    let salType: string | null = null
    let salAmt: number | null = null
    if (col.salary >= 0) {
      const parsed = parseEmployeeSalaryCell(cell(r, col.salary))
      salAmt = parsed.amt
      salType = parsed.type || null
    }
    if (col.sal_amt >= 0) {
      const raw = present(col.sal_amt, cell(r, col.sal_amt))
      if (raw) {
        const n = parseFloat(raw.replace(/,/g, ''))
        if (Number.isFinite(n)) salAmt = n
      }
    }
    if (col.sal_type >= 0) {
      const raw = present(col.sal_type, cell(r, col.sal_type))
      const t = raw ? canonicalSalType(raw) : ''
      if (t) salType = t
    }

    let annualLeaveDays: number | null = null
    if (col.annual_leave_days >= 0) {
      const raw = present(col.annual_leave_days, cell(r, col.annual_leave_days))
      if (raw) {
        const n = parseFloat(raw.replace(/,/g, ''))
        if (Number.isFinite(n) && n >= 0) annualLeaveDays = n
      }
    }
    let positionAllowance: number | null = null
    if (col.position_allowance >= 0) {
      const raw = present(col.position_allowance, cell(r, col.position_allowance))
      if (raw) {
        const n = parseFloat(raw.replace(/,/g, ''))
        if (Number.isFinite(n)) positionAllowance = n
      }
    }

    const jobRaw = present(col.job, cell(r, col.job))
    const roleRaw = present(col.role, cell(r, col.role))

    rows.push({
      store,
      name,
      nameTitle,
      nick: present(col.nick, cell(r, col.nick)),
      employeeCode,
      employeeCodeInvalid,
      phone: present(col.phone, cell(r, col.phone)),
      job: jobRaw ? getEmployeeJobOptionLabel(jobRaw) : null,
      birth: col.birth >= 0 ? parseEmployeeCsvDate(cell(r, col.birth)) : null,
      nation: present(col.nation, cell(r, col.nation)),
      joinDate: col.join_date >= 0 ? parseEmployeeCsvDate(cell(r, col.join_date)) : null,
      resignDate: col.resign_date >= 0 ? parseEmployeeCsvDate(cell(r, col.resign_date)) : null,
      salType,
      salAmt,
      password: present(col.password, cell(r, col.password)),
      role: roleRaw ? canonicalRole(roleRaw) : null,
      email: present(col.email, cell(r, col.email)),
      photo: present(col.photo, cell(r, col.photo)),
      grade: col.grade >= 0 ? parseGradeCell(cell(r, col.grade)) : null,
      annualLeaveDays,
      bankName: present(col.bank_name, cell(r, col.bank_name)),
      accountNumber: present(col.account_number, cell(r, col.account_number)),
      positionAllowance,
    })
  }
  if (rows.length === 0) return { rows: [], error: '유효한 행이 없습니다.' }
  return { rows, error: null }
}

function personKey(store: string, name: string, nameTitle = ''): string {
  const n = normalizeEmployeeNameFields(name, nameTitle)
  return `${store.trim().toLowerCase()}|||${n.name.trim().toLowerCase()}`
}

function patchFromRow(row: ParsedEmployeeCsvRow, setCode: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    store: row.store,
    name: row.name,
  }
  if (row.nameTitle) patch.name_title = row.nameTitle
  if (row.nick != null) patch.nick = row.nick
  if (setCode && row.employeeCode) patch.employee_code = row.employeeCode
  if (row.phone != null) patch.phone = row.phone
  if (row.job != null) patch.job = row.job
  if (row.birth) patch.birth = row.birth
  if (row.nation != null) patch.nation = row.nation
  if (row.joinDate) patch.join_date = row.joinDate
  if (row.resignDate) patch.resign_date = row.resignDate
  if (row.salType) patch.sal_type = row.salType
  if (row.salAmt != null) patch.sal_amt = row.salAmt
  if (row.password) patch.password = row.password
  if (row.role) patch.role = row.role
  if (row.email != null) patch.email = row.email
  if (row.photo != null) patch.photo = row.photo
  if (row.grade != null) patch.grade = row.grade
  if (row.annualLeaveDays != null) patch.annual_leave_days = row.annualLeaveDays
  if (row.bankName != null) patch.bank_name = row.bankName
  if (row.accountNumber != null) patch.account_number = row.accountNumber
  if (row.positionAllowance != null) patch.position_allowance = row.positionAllowance
  return patch
}

function insertFromRow(row: ParsedEmployeeCsvRow, setCode: boolean): Record<string, unknown> {
  const rowOut: Record<string, unknown> = {
    store: row.store,
    name: row.name,
    name_title: row.nameTitle || '',
    nick: row.nick || '',
    phone: row.phone || '',
    job: row.job || 'Service',
    birth: row.birth,
    nation: row.nation || '',
    join_date: row.joinDate,
    resign_date: row.resignDate,
    sal_type: row.salType || 'Monthly',
    sal_amt: row.salAmt ?? 0,
    password: row.password || '',
    role: row.role || 'Staff',
    email: row.email || '',
    annual_leave_days: row.annualLeaveDays ?? 6,
    bank_name: row.bankName || '',
    account_number: row.accountNumber || '',
    position_allowance: row.positionAllowance ?? 0,
    grade: row.grade || '',
    photo: row.photo || '',
  }
  if (setCode && row.employeeCode) rowOut.employee_code = row.employeeCode
  return rowOut
}

/**
 * 기존 직원은 삭제하지 않는다.
 * 맞추는 순서: 직원 코드 → 매장+이름(한 명일 때만).
 * 코드는 비어 있는 사람에게만 새로 넣고, 다른 사람 코드는 빼앗지 않는다.
 */
export function planEmployeeCsvMerge(
  parsed: ParsedEmployeeCsvRow[],
  existing: ExistingEmployeeForCsv[]
): EmployeeCsvMergePlan {
  const active = existing.filter((e) => !e.deleted && e.id > 0)
  const byCode = new Map<string, ExistingEmployeeForCsv>()
  const byName = new Map<string, ExistingEmployeeForCsv[]>()
  for (const e of active) {
    const code = normalizeEmployeeCodeInput(e.employeeCode)
    if (isEmployeeCodeFormat(code) && !byCode.has(code)) byCode.set(code, e)
    const key = personKey(e.store, e.name, e.nameTitle)
    const list = byName.get(key) || []
    list.push(e)
    byName.set(key, list)
  }

  const updates: EmployeeCsvMergePlan['updates'] = []
  const inserts: Record<string, unknown>[] = []
  let skippedCodes = 0
  let skippedRows = 0
  /** 이번 CSV에서 새로 넣을 행. 같은 이름이 한 번 더 나오면 추가 대신 그 행을 고친다. */
  const pendingByName = new Map<string, number>()

  for (const row of parsed) {
    if (row.employeeCodeInvalid) skippedCodes += 1
    const nameKey = personKey(row.store, row.name, row.nameTitle)

    let match: ExistingEmployeeForCsv | null = null
    if (row.employeeCode) {
      const byExistingCode = byCode.get(row.employeeCode)
      if (byExistingCode && byExistingCode.id > 0) match = byExistingCode
    }
    if (!match) {
      const hits = byName.get(nameKey) || []
      if (hits.length > 1) {
        skippedRows += 1
        continue
      }
      if (hits.length === 1) match = hits[0]
    }

    let setCode = false
    if (row.employeeCode) {
      const owner = byCode.get(row.employeeCode)
      const ownerIsMatch = !!owner && match && owner.id === match.id
      const ownerIsPending = !!owner && owner.id < 0
      if (!owner || ownerIsMatch) setCode = true
      else if (ownerIsPending && pendingByName.get(nameKey) === -owner.id - 1) setCode = true
      else skippedCodes += 1
    }

    if (match) {
      const patch = patchFromRow(row, setCode)
      if (setCode && row.employeeCode) {
        const prev = normalizeEmployeeCodeInput(match.employeeCode)
        if (prev && prev !== row.employeeCode) {
          delete patch.employee_code
          skippedCodes += 1
        } else if (!prev) {
          byCode.set(row.employeeCode, { ...match, employeeCode: row.employeeCode })
        }
      }
      const prevIdx = updates.findIndex((u) => u.id === match.id)
      if (prevIdx >= 0) updates.splice(prevIdx, 1)
      updates.push({ id: match.id, patch })
      continue
    }

    const pendingIdx = pendingByName.get(nameKey)
    if (pendingIdx != null) {
      const prevInsert = inserts[pendingIdx]
      const prevCode = normalizeEmployeeCodeInput(prevInsert.employee_code)
      const patch = patchFromRow(row, setCode && (!prevCode || prevCode === row.employeeCode))
      if (prevCode && row.employeeCode && prevCode !== row.employeeCode) {
        delete patch.employee_code
        skippedCodes += 1
      }
      inserts[pendingIdx] = { ...prevInsert, ...patch }
      if (setCode && row.employeeCode && !prevCode) {
        inserts[pendingIdx].employee_code = row.employeeCode
        byCode.set(row.employeeCode, {
          id: -(pendingIdx + 1),
          store: row.store,
          name: row.name,
          nameTitle: row.nameTitle,
          employeeCode: row.employeeCode,
          role: row.role || 'Staff',
          deleted: false,
        })
      }
      continue
    }

    const inserted = insertFromRow(row, setCode)
    inserts.push(inserted)
    pendingByName.set(nameKey, inserts.length - 1)
    if (setCode && row.employeeCode) {
      byCode.set(row.employeeCode, {
        id: -inserts.length,
        store: row.store,
        name: row.name,
        nameTitle: row.nameTitle,
        employeeCode: row.employeeCode,
        role: row.role || 'Staff',
        deleted: false,
      })
    }
  }

  return { updates, inserts, skippedCodes, skippedRows }
}
