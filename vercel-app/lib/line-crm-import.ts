import crypto from 'crypto'
import * as XLSX from 'xlsx'
import { createMember } from '@/lib/members-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseInsert, supabaseInsertMany, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type ReportType = 'customer' | 'point' | 'coupon'

type ParsedRow = {
  rowNo: number
  lineDisplayName: string
  firstName: string
  lastName: string
  phone: string
  fullName: string
  email: string
  birthDate: string
  transactionId: string
  pointStatus: string
  couponCode: string
  points: number
}

export type LineCrmImportResult = {
  success: boolean
  jobId?: string
  reportType?: ReportType
  rowCount?: number
  successCount?: number
  failedCount?: number
  message?: string
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return msg.includes('PGRST205') && msg.includes(`public.${tableName}`)
}

function normalizeHeader(v: unknown): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, '')
}

function normalizePhone(v: string): string {
  return String(v || '').replace(/[^\d+]/g, '').trim()
}

function normalizeDate(v: unknown): string {
  const raw = v
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const yyyy = String(parsed.y).padStart(4, '0')
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
  }
  const s = String(v || '').trim()
  if (!s) return ''
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    const yyyy = m[3]
    return `${yyyy}-${mm}-${dd}`
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function toNumber(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function detectReportType(headers: string[]): ReportType {
  const hasTransaction = headers.includes('transactionid')
  const hasCouponCode = headers.includes('couponcode')
  if (hasCouponCode) return 'coupon'
  if (hasTransaction) return 'point'
  return 'customer'
}

function includesAnyToken(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token))
}

function findColumnIndex(headers: string[], tokens: string[]): number {
  return headers.findIndex((h) => includesAnyToken(h, tokens))
}

function scoreHeaderRow(headers: string[]): number {
  let score = 0
  if (findColumnIndex(headers, ['linedisplayname', 'displayname', 'lineusername']) >= 0) score += 2
  if (findColumnIndex(headers, ['firstname']) >= 0) score += 1
  if (findColumnIndex(headers, ['lastname']) >= 0) score += 1
  if (findColumnIndex(headers, ['phonenumber', 'phone', 'mobile']) >= 0) score += 2
  if (findColumnIndex(headers, ['fullname', 'name']) >= 0) score += 1
  if (findColumnIndex(headers, ['dateofbirth', 'birthday', 'birthdate', 'dob']) >= 0) score += 1
  if (findColumnIndex(headers, ['email', 'mail']) >= 0) score += 1
  if (findColumnIndex(headers, ['transactionid']) >= 0) score += 1
  if (findColumnIndex(headers, ['couponcode']) >= 0) score += 1
  if (findColumnIndex(headers, ['point', 'points']) >= 0) score += 1
  return score
}

function detectHeaderRowIndex(data: unknown[][]): number {
  const scanLimit = Math.min(data.length, 30)
  let bestIndex = 0
  let bestScore = -1
  for (let i = 0; i < scanLimit; i += 1) {
    const row = data[i] || []
    const headers = row.map((v) => normalizeHeader(v)).filter(Boolean)
    const score = scoreHeaderRow(headers)
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestScore >= 2 ? bestIndex : 0
}

function parseSheetRows(data: unknown[][]): { reportType: ReportType; rows: ParsedRow[] } {
  if (data.length < 2) return { reportType: 'customer', rows: [] }
  const headerRowIndex = detectHeaderRowIndex(data)
  const headerRow = data[headerRowIndex] || []
  const normalizedHeaders = headerRow.map((v) => normalizeHeader(v))
  const idx = {
    lineDisplayName: findColumnIndex(normalizedHeaders, ['linedisplayname', 'displayname', 'lineusername']),
    firstName: findColumnIndex(normalizedHeaders, ['firstname', 'givenname']),
    lastName: findColumnIndex(normalizedHeaders, ['lastname', 'surname', 'familyname']),
    phone: findColumnIndex(normalizedHeaders, ['phonenumber', 'phone', 'mobile']),
    fullName: findColumnIndex(normalizedHeaders, ['fullname', 'name']),
    email: findColumnIndex(normalizedHeaders, ['email', 'mail']),
    birthDate: findColumnIndex(normalizedHeaders, ['dateofbirth', 'birthday', 'birthdate', 'dob']),
    transactionId: findColumnIndex(normalizedHeaders, ['transactionid']),
    pointStatus: findColumnIndex(normalizedHeaders, ['pointstatus', 'status']),
    couponCode: findColumnIndex(normalizedHeaders, ['couponcode']),
    points: findColumnIndex(normalizedHeaders, ['point', 'points']),
  }
  if (idx.lineDisplayName < 0 && idx.phone < 0 && idx.fullName < 0 && idx.birthDate < 0) {
    // Fallback for files where header is missing/merged but column order follows LINE CRM customer export.
    idx.lineDisplayName = 0
    idx.phone = 1
    idx.fullName = 2
    idx.birthDate = 3
    if (idx.email < 0) idx.email = 5
  }
  const reportType = detectReportType(normalizedHeaders)
  const rows: ParsedRow[] = []

  for (let i = headerRowIndex + 1; i < data.length; i += 1) {
    const row = data[i] || []
    const lineDisplayName = idx.lineDisplayName >= 0 ? String(row[idx.lineDisplayName] || '').trim() : ''
    const firstName = idx.firstName >= 0 ? String(row[idx.firstName] || '').trim() : ''
    const lastName = idx.lastName >= 0 ? String(row[idx.lastName] || '').trim() : ''
    const phone = idx.phone >= 0 ? normalizePhone(String(row[idx.phone] || '')) : ''
    let fullName = idx.fullName >= 0 ? String(row[idx.fullName] || '').trim() : ''
    if (!fullName && (firstName || lastName)) {
      fullName = `${firstName} ${lastName}`.trim()
    }
    const finalDisplayName = lineDisplayName || firstName
    const email = idx.email >= 0 ? String(row[idx.email] || '').trim().toLowerCase() : ''
    const birthDate = idx.birthDate >= 0 ? normalizeDate(row[idx.birthDate]) : ''
    const transactionId = idx.transactionId >= 0 ? String(row[idx.transactionId] || '').trim() : ''
    const pointStatus = idx.pointStatus >= 0 ? String(row[idx.pointStatus] || '').trim() : ''
    const couponCode = idx.couponCode >= 0 ? String(row[idx.couponCode] || '').trim() : ''
    let points = idx.points >= 0 ? toNumber(row[idx.points]) : 0
    const statusKey = normalizeHeader(pointStatus)
    if (points > 0 && (statusKey.includes('use') || statusKey.includes('redeem') || statusKey.includes('deduct'))) {
      points = -points
    }
    if (!finalDisplayName && !phone && !fullName) continue
    rows.push({
      rowNo: i + 1,
      lineDisplayName: finalDisplayName,
      firstName,
      lastName,
      phone,
      fullName,
      email,
      birthDate,
      transactionId,
      pointStatus,
      couponCode,
      points,
    })
  }
  return { reportType, rows }
}

async function findMemberIdByPhone(phone: string): Promise<number> {
  const normalized = normalizePhone(phone)
  if (!normalized) return 0
  const rows = (await supabaseSelectFilter('members', `phone=eq.${encodeURIComponent(normalized)}`, {
    limit: 1,
    select: 'id',
  })) as Array<{ id?: number }>
  const exact = Number(rows?.[0]?.id || 0)
  if (exact > 0) return exact
  // Backward compatibility: previously some phones were saved without leading zero.
  if (normalized.startsWith('0') && normalized.length >= 9) {
    const rowsWithoutZero = (await supabaseSelectFilter('members', `phone=eq.${encodeURIComponent(normalized.slice(1))}`, {
      limit: 1,
      select: 'id',
    })) as Array<{ id?: number }>
    const idWithoutZero = Number(rowsWithoutZero?.[0]?.id || 0)
    if (idWithoutZero > 0) return idWithoutZero
  } else if (!normalized.startsWith('0') && normalized.length >= 8) {
    const rowsWithZero = (await supabaseSelectFilter('members', `phone=eq.${encodeURIComponent(`0${normalized}`)}`, {
      limit: 1,
      select: 'id',
    })) as Array<{ id?: number }>
    const idWithZero = Number(rowsWithZero?.[0]?.id || 0)
    if (idWithZero > 0) return idWithZero
  }
  return 0
}

async function findMemberIdByLineDisplayName(lineDisplayName: string): Promise<number> {
  const key = String(lineDisplayName || '').trim()
  if (!key) return 0
  const rows = (await supabaseSelectFilter('members', `line_display_name=eq.${encodeURIComponent(key)}`, {
    limit: 1,
    select: 'id',
  })) as Array<{ id?: number }>
  return Number(rows?.[0]?.id || 0)
}

export async function processLineCrmImport(params: {
  fileName: string
  fileBuffer: ArrayBuffer
  createdBy?: string
}): Promise<LineCrmImportResult> {
  const wb = XLSX.read(new Uint8Array(params.fileBuffer), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0] || 'Sheet1']
  if (!ws) return { success: false, message: '시트를 찾을 수 없습니다.' }

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
  const parsed = parseSheetRows(data)
  if (parsed.rows.length === 0) {
    return { success: false, message: '가져올 데이터가 없습니다.' }
  }

  const jobId = crypto.randomUUID()
  let canWriteImportLog = true
  let warningMessage = ''
  try {
    await supabaseInsert('line_import_jobs', {
      id: jobId,
      report_type: parsed.reportType,
      file_name: String(params.fileName || 'line-crm-import.xlsx'),
      row_count: parsed.rows.length,
      success_count: 0,
      failed_count: 0,
      created_by: String(params.createdBy || '').trim() || null,
    })
  } catch (e) {
    if (isMissingTableError(e, 'line_import_jobs')) {
      canWriteImportLog = false
      warningMessage = 'line_import_jobs 테이블이 없어 로그 저장 없이 반영만 진행했습니다.'
    } else {
      throw e
    }
  }

  const now = getBangkokDateTimeString()
  const rowLogs: Record<string, unknown>[] = []
  let successCount = 0
  let failedCount = 0

  for (const row of parsed.rows) {
    try {
      let memberId = await findMemberIdByPhone(row.phone)
      if (!memberId) memberId = await findMemberIdByLineDisplayName(row.lineDisplayName)
      if (!memberId) {
        const created = await createMember({
          name: row.fullName || row.lineDisplayName || 'LINE 고객',
          phone: row.phone,
          email: row.email,
          source: 'line_import',
        })
        memberId = Number(created.id || 0)
      }
      if (!memberId) throw new Error('회원 생성/조회 실패')

      await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
        name: row.fullName || row.lineDisplayName || 'LINE 고객',
        full_name: row.fullName || null,
        line_display_name: row.lineDisplayName || null,
        phone: row.phone || null,
        email: row.email || null,
        birth_date: row.birthDate || null,
        updated_at: now,
      })

      if (parsed.reportType === 'point' && row.points !== 0) {
        await supabaseInsert('member_points_ledger', {
          member_id: memberId,
          kind: row.points > 0 ? 'adjust' : 'use',
          points: Math.trunc(row.points),
          amount: 0,
          note: row.transactionId ? `LINE CRM import tx:${row.transactionId}` : 'LINE CRM import',
          created_at: now,
        })
      }

      if (parsed.reportType === 'coupon' && row.couponCode) {
        await supabaseInsert('member_coupon_issues', {
          member_id: memberId,
          coupon_code: row.couponCode,
          status: 'issued',
          issued_at: now,
        })
      }

      if (canWriteImportLog) {
        rowLogs.push({
          job_id: jobId,
          row_no: row.rowNo,
          report_type: parsed.reportType,
          line_display_name: row.lineDisplayName || null,
          phone: row.phone || null,
          full_name: row.fullName || null,
          transaction_id: row.transactionId || null,
          message: row.pointStatus ? `status:${row.pointStatus}` : null,
          coupon_code: row.couponCode || null,
          points: Math.trunc(row.points || 0),
          status: 'success',
        })
      }
      successCount += 1
    } catch (e) {
      if (canWriteImportLog) {
        rowLogs.push({
          job_id: jobId,
          row_no: row.rowNo,
          report_type: parsed.reportType,
          line_display_name: row.lineDisplayName || null,
          phone: row.phone || null,
          full_name: row.fullName || null,
          transaction_id: row.transactionId || null,
          message: row.pointStatus ? `status:${row.pointStatus}` : (e instanceof Error ? e.message : 'unknown error'),
          coupon_code: row.couponCode || null,
          points: Math.trunc(row.points || 0),
          status: 'failed',
        })
      }
      failedCount += 1
    }
  }

  if (canWriteImportLog && rowLogs.length > 0) {
    try {
      for (let i = 0; i < rowLogs.length; i += 500) {
        await supabaseInsertMany('line_import_rows', rowLogs.slice(i, i + 500))
      }
      await supabaseUpdateByFilter('line_import_jobs', `id=eq.${encodeURIComponent(jobId)}`, {
        success_count: successCount,
        failed_count: failedCount,
      })
    } catch (e) {
      if (isMissingTableError(e, 'line_import_rows')) {
        warningMessage = 'line_import_rows 테이블이 없어 행 로그 저장은 건너뛰었습니다.'
      } else {
        throw e
      }
    }
  }

  return {
    success: true,
    jobId: canWriteImportLog ? jobId : undefined,
    reportType: parsed.reportType,
    rowCount: parsed.rows.length,
    successCount,
    failedCount,
    message: warningMessage || undefined,
  }
}
