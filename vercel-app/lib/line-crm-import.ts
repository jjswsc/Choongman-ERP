import crypto from 'crypto'
import * as XLSX from 'xlsx'
import { createMember } from '@/lib/members-server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { normalizeMemberPoints } from '@/lib/member-points-math'
import { supabaseInsert, supabaseInsertMany, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type ReportType = 'customer' | 'point' | 'coupon'

type ParsedRow = {
  rowNo: number
  lineDisplayName: string
  memberType: string
  firstName: string
  lastName: string
  phone: string
  fullName: string
  email: string
  birthDate: string
  age: number
  gender: string
  address: string
  subdistrict: string
  district: string
  province: string
  postcode: string
  membershipTier: string
  tag: string
  branch: string
  currentPoints: number
  totalPoints: number
  tierPoints: number
  usageCount: number
  lastActiveAt: string
  lastActiveDays: number
  memberStatus: string
  registeredAt: string
  transactionId: string
  pointStatus: string
  couponCode: string
  points: number
}

type ReportMeta = {
  fileName?: string
  exportedAt?: string
  shopName?: string
  menuName?: string
  periodStart?: string
  periodEnd?: string
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

function isMissingColumnError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '')
  return (
    /PGRST204/i.test(msg) ||
    (/column/i.test(msg) && (/does not exist/i.test(msg) || /could not find/i.test(msg)))
  )
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

function normalizeDateTime(v: unknown): string {
  const raw = v
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw)
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const yyyy = String(parsed.y).padStart(4, '0')
      const mm = String(parsed.m).padStart(2, '0')
      const dd = String(parsed.d).padStart(2, '0')
      const hh = String(parsed.H || 0).padStart(2, '0')
      const mi = String(parsed.M || 0).padStart(2, '0')
      const ss = String(parsed.S || 0).padStart(2, '0')
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
    }
  }
  const s = String(v || '').trim()
  if (!s || s === '-') return ''
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    const yyyy = m[3]
    const hh = String(m[4] || '00').padStart(2, '0')
    const mi = String(m[5] || '00').padStart(2, '0')
    const ss = String(m[6] || '00').padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function toNumber(v: unknown): number {
  const n = Number(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

function parseReportMeta(data: unknown[][]): ReportMeta {
  const header = (data[0] || []).map((x) => normalizeHeader(x))
  const values = data[1] || []
  const getByTokens = (tokens: string[]): string => {
    const idx = findColumnIndex(header, tokens)
    return idx >= 0 ? String(values[idx] || '').trim() : ''
  }
  return {
    fileName: getByTokens(['filename']),
    exportedAt: normalizeDateTime(getByTokens(['exportat'])),
    shopName: getByTokens(['shopname']),
    menuName: getByTokens(['menuname']),
    periodStart: normalizeDate(getByTokens(['startdate'])),
    periodEnd: normalizeDate(getByTokens(['enddate'])),
  }
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

/** LINE CRM 엑셀 → ERP members 포인트 필드 매핑 (단위 테스트용 export) */
export function resolveLineCrmMemberPointPatch(params: {
  hasCurrentPointsCol: boolean
  hasTotalPointsCol: boolean
  hasTierPointsCol: boolean
  currentPoints: number
  totalPoints: number
  tierPoints: number
}): {
  point_balance?: number
  tier_points?: number
  line_current_points?: number
  line_total_points?: number
  line_tier_points?: number
} {
  const current = normalizeMemberPoints(params.currentPoints)
  const total = normalizeMemberPoints(params.totalPoints)
  const tierFromCol = normalizeMemberPoints(params.tierPoints)
  const tierQual =
    params.hasTierPointsCol ? tierFromCol : params.hasTotalPointsCol ? total : undefined

  return {
    ...(params.hasCurrentPointsCol ? { point_balance: current, line_current_points: current } : {}),
    ...(tierQual !== undefined ? { tier_points: tierQual } : {}),
    ...(params.hasTotalPointsCol ? { line_total_points: total } : {}),
    ...(params.hasTierPointsCol ? { line_tier_points: tierFromCol } : {}),
  }
}

function scoreHeaderRow(headers: string[]): number {
  let score = 0
  if (findColumnIndex(headers, ['membertype']) >= 0) score += 2
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
  if (findColumnIndex(headers, ['membershiptier']) >= 0) score += 1
  if (findColumnIndex(headers, ['currentpoints', 'currentpoint', 'pointbalance']) >= 0) score += 1
  if (findColumnIndex(headers, ['totalpoints', 'totalpoint']) >= 0) score += 1
  if (findColumnIndex(headers, ['lastactivedate']) >= 0) score += 1
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

function parseSheetRows(data: unknown[][]): {
  reportType: ReportType
  rows: ParsedRow[]
  meta: ReportMeta
  columnFlags: {
    hasCurrentPointsCol: boolean
    hasTotalPointsCol: boolean
    hasTierPointsCol: boolean
  }
} {
  if (data.length < 2) {
    return {
      reportType: 'customer',
      rows: [],
      meta: {},
      columnFlags: {
        hasCurrentPointsCol: false,
        hasTotalPointsCol: false,
        hasTierPointsCol: false,
      },
    }
  }
  const meta = parseReportMeta(data)
  const headerRowIndex = detectHeaderRowIndex(data)
  const headerRow = data[headerRowIndex] || []
  const normalizedHeaders = headerRow.map((v) => normalizeHeader(v))
  const idx = {
    memberType: findColumnIndex(normalizedHeaders, ['membertype']),
    lineDisplayName: findColumnIndex(normalizedHeaders, ['linedisplayname', 'displayname', 'lineusername']),
    firstName: findColumnIndex(normalizedHeaders, ['firstname', 'givenname']),
    lastName: findColumnIndex(normalizedHeaders, ['lastname', 'surname', 'familyname']),
    phone: findColumnIndex(normalizedHeaders, ['phonenumber', 'phone', 'mobile']),
    fullName: findColumnIndex(normalizedHeaders, ['fullname', 'name']),
    age: findColumnIndex(normalizedHeaders, ['age']),
    email: findColumnIndex(normalizedHeaders, ['email', 'mail']),
    birthDate: findColumnIndex(normalizedHeaders, ['dateofbirth', 'birthday', 'birthdate', 'dob']),
    gender: findColumnIndex(normalizedHeaders, ['gender']),
    address: findColumnIndex(normalizedHeaders, ['address']),
    subdistrict: findColumnIndex(normalizedHeaders, ['subdistrict']),
    district: findColumnIndex(normalizedHeaders, ['district']),
    province: findColumnIndex(normalizedHeaders, ['province']),
    postcode: findColumnIndex(normalizedHeaders, ['postcode', 'zipcode']),
    membershipTier: findColumnIndex(normalizedHeaders, ['membershiptier']),
    tag: findColumnIndex(normalizedHeaders, ['tag']),
    branch: findColumnIndex(normalizedHeaders, ['branch']),
    currentPoints: findColumnIndex(normalizedHeaders, [
      'currentpoints',
      'currentpoint',
      'pointbalance',
      'availablepoints',
    ]),
    totalPoints: findColumnIndex(normalizedHeaders, [
      'totalpoints',
      'totalpoint',
      'lifetimepoints',
      'accumulatedpoints',
    ]),
    tierPoints: findColumnIndex(normalizedHeaders, [
      'pointsformembershiptiercalculation',
      'pointsformembershiptier',
      'membershiptiercalculation',
      'membershiptierpoints',
      'tiercalculation',
      'tierpoints',
    ]),
    usageCount: findColumnIndex(normalizedHeaders, ['usage']),
    lastActiveAt: findColumnIndex(normalizedHeaders, ['lastactivedate']),
    lastActiveDays: findColumnIndex(normalizedHeaders, ['lastactivedays']),
    memberStatus: findColumnIndex(normalizedHeaders, ['status']),
    registeredAt: findColumnIndex(normalizedHeaders, ['registereddate']),
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
    const memberType = idx.memberType >= 0 ? String(row[idx.memberType] || '').trim() : ''
    const firstName = idx.firstName >= 0 ? String(row[idx.firstName] || '').trim() : ''
    const lastName = idx.lastName >= 0 ? String(row[idx.lastName] || '').trim() : ''
    const phone = idx.phone >= 0 ? normalizePhone(String(row[idx.phone] || '')) : ''
    let fullName = idx.fullName >= 0 ? String(row[idx.fullName] || '').trim() : ''
    if (!fullName && (firstName || lastName)) {
      fullName = `${firstName} ${lastName}`.trim()
    }
    const finalDisplayName = lineDisplayName || firstName
    const age = idx.age >= 0 ? toNumber(row[idx.age]) : 0
    const email = idx.email >= 0 ? String(row[idx.email] || '').trim().toLowerCase() : ''
    const birthDate = idx.birthDate >= 0 ? normalizeDate(row[idx.birthDate]) : ''
    const gender = idx.gender >= 0 ? String(row[idx.gender] || '').trim().toLowerCase() : ''
    const address = idx.address >= 0 ? String(row[idx.address] || '').trim() : ''
    const subdistrict = idx.subdistrict >= 0 ? String(row[idx.subdistrict] || '').trim() : ''
    const district = idx.district >= 0 ? String(row[idx.district] || '').trim() : ''
    const province = idx.province >= 0 ? String(row[idx.province] || '').trim() : ''
    const postcode = idx.postcode >= 0 ? String(row[idx.postcode] || '').trim() : ''
    const membershipTier = idx.membershipTier >= 0 ? String(row[idx.membershipTier] || '').trim() : ''
    const tag = idx.tag >= 0 ? String(row[idx.tag] || '').trim() : ''
    const branch = idx.branch >= 0 ? String(row[idx.branch] || '').trim() : ''
    const currentPoints = idx.currentPoints >= 0 ? toNumber(row[idx.currentPoints]) : 0
    const totalPoints = idx.totalPoints >= 0 ? toNumber(row[idx.totalPoints]) : 0
    const tierPoints = idx.tierPoints >= 0 ? toNumber(row[idx.tierPoints]) : 0
    const usageCount = idx.usageCount >= 0 ? Math.trunc(toNumber(row[idx.usageCount])) : 0
    const lastActiveAt = idx.lastActiveAt >= 0 ? normalizeDateTime(row[idx.lastActiveAt]) : ''
    const lastActiveDays = idx.lastActiveDays >= 0 ? Math.trunc(toNumber(row[idx.lastActiveDays])) : 0
    const memberStatus = idx.memberStatus >= 0 ? String(row[idx.memberStatus] || '').trim() : ''
    const registeredAt = idx.registeredAt >= 0 ? normalizeDateTime(row[idx.registeredAt]) : ''
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
      memberType,
      firstName,
      lastName,
      phone,
      fullName,
      email,
      birthDate,
      age,
      gender,
      address,
      subdistrict,
      district,
      province,
      postcode,
      membershipTier,
      tag,
      branch,
      currentPoints,
      totalPoints,
      tierPoints,
      usageCount,
      lastActiveAt,
      lastActiveDays,
      memberStatus,
      registeredAt,
      transactionId,
      pointStatus,
      couponCode,
      points,
    })
  }
  return {
    reportType,
    rows,
    meta,
    columnFlags: {
      hasCurrentPointsCol: idx.currentPoints >= 0,
      hasTotalPointsCol: idx.totalPoints >= 0,
      hasTierPointsCol: idx.tierPoints >= 0,
    },
  }
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
      exported_at: parsed.meta.exportedAt || null,
      shop_name: parsed.meta.shopName || null,
      menu_name: parsed.meta.menuName || null,
      period_start: parsed.meta.periodStart || null,
      period_end: parsed.meta.periodEnd || null,
    })
  } catch (e) {
    if (isMissingTableError(e, 'line_import_jobs')) {
      canWriteImportLog = false
      warningMessage = 'line_import_jobs 테이블이 없어 로그 저장 없이 반영만 진행했습니다.'
    } else if (isMissingColumnError(e)) {
      await supabaseInsert('line_import_jobs', {
        id: jobId,
        report_type: parsed.reportType,
        file_name: String(params.fileName || 'line-crm-import.xlsx'),
        row_count: parsed.rows.length,
        success_count: 0,
        failed_count: 0,
        created_by: String(params.createdBy || '').trim() || null,
      })
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
          birthDate: row.birthDate || undefined,
          gender: row.gender || undefined,
          joinChannel: 'line',
          source: 'line_import',
        })
        memberId = Number(created.id || 0)
      }
      if (!memberId) throw new Error('회원 생성/조회 실패')

      const membershipTierCode = String(row.membershipTier || '')
        .trim()
        .toUpperCase()
      const pointPatch = resolveLineCrmMemberPointPatch({
        hasCurrentPointsCol: parsed.columnFlags.hasCurrentPointsCol,
        hasTotalPointsCol: parsed.columnFlags.hasTotalPointsCol,
        hasTierPointsCol: parsed.columnFlags.hasTierPointsCol,
        currentPoints: row.currentPoints,
        totalPoints: row.totalPoints,
        tierPoints: row.tierPoints,
      })
      const memberPatch = {
        name: row.fullName || row.lineDisplayName || 'LINE 고객',
        full_name: row.fullName || null,
        line_member_type: row.memberType || null,
        line_first_name: row.firstName || null,
        line_last_name: row.lastName || null,
        line_display_name: row.lineDisplayName || null,
        phone: row.phone || null,
        email: row.email || null,
        birth_date: row.birthDate || null,
        gender: row.gender || null,
        line_address: row.address || null,
        line_subdistrict: row.subdistrict || null,
        line_district: row.district || null,
        line_province: row.province || null,
        line_postcode: row.postcode || null,
        line_membership_tier: row.membershipTier || null,
        line_member_tag: row.tag || null,
        line_member_branch: row.branch || null,
        line_usage_count: row.usageCount,
        line_last_active_at: row.lastActiveAt || null,
        line_last_active_days: row.lastActiveDays,
        line_member_status: row.memberStatus || null,
        line_registered_at: row.registeredAt || null,
        line_exported_at: parsed.meta.exportedAt || null,
        tier_code: membershipTierCode || undefined,
        ...pointPatch,
        updated_at: now,
      }
      try {
        await supabaseUpdateByFilter('members', `id=eq.${memberId}`, memberPatch)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e || '')
        if (!/column/i.test(msg)) throw e
        await supabaseUpdateByFilter('members', `id=eq.${memberId}`, {
          name: row.fullName || row.lineDisplayName || 'LINE 고객',
          full_name: row.fullName || null,
          line_display_name: row.lineDisplayName || null,
          phone: row.phone || null,
          email: row.email || null,
          birth_date: row.birthDate || null,
          updated_at: now,
        })
      }

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
          raw_payload: {
            memberType: row.memberType,
            firstName: row.firstName,
            lastName: row.lastName,
            age: row.age,
            gender: row.gender,
            address: row.address,
            subdistrict: row.subdistrict,
            district: row.district,
            province: row.province,
            postcode: row.postcode,
            membershipTier: row.membershipTier,
            tag: row.tag,
            branch: row.branch,
            currentPoints: row.currentPoints,
            totalPoints: row.totalPoints,
            tierPoints: row.tierPoints,
            usageCount: row.usageCount,
            lastActiveAt: row.lastActiveAt,
            lastActiveDays: row.lastActiveDays,
            memberStatus: row.memberStatus,
            registeredAt: row.registeredAt,
            exportedAt: parsed.meta.exportedAt || null,
            shopName: parsed.meta.shopName || null,
            menuName: parsed.meta.menuName || null,
            periodStart: parsed.meta.periodStart || null,
            periodEnd: parsed.meta.periodEnd || null,
          },
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
          raw_payload: {
            memberType: row.memberType,
            firstName: row.firstName,
            lastName: row.lastName,
            age: row.age,
            gender: row.gender,
            address: row.address,
            subdistrict: row.subdistrict,
            district: row.district,
            province: row.province,
            postcode: row.postcode,
            membershipTier: row.membershipTier,
            tag: row.tag,
            branch: row.branch,
            currentPoints: row.currentPoints,
            totalPoints: row.totalPoints,
            tierPoints: row.tierPoints,
            usageCount: row.usageCount,
            lastActiveAt: row.lastActiveAt,
            lastActiveDays: row.lastActiveDays,
            memberStatus: row.memberStatus,
            registeredAt: row.registeredAt,
            exportedAt: parsed.meta.exportedAt || null,
            shopName: parsed.meta.shopName || null,
            menuName: parsed.meta.menuName || null,
            periodStart: parsed.meta.periodStart || null,
            periodEnd: parsed.meta.periodEnd || null,
          },
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
      } else if (isMissingColumnError(e)) {
        for (let i = 0; i < rowLogs.length; i += 500) {
          const chunk = rowLogs
            .slice(i, i + 500)
            .map(({ raw_payload, ...rest }) => ({ ...rest }))
          await supabaseInsertMany('line_import_rows', chunk)
        }
        await supabaseUpdateByFilter('line_import_jobs', `id=eq.${encodeURIComponent(jobId)}`, {
          success_count: successCount,
          failed_count: failedCount,
        })
        warningMessage = 'line_import_rows의 raw_payload 컬럼이 없어 확장 원본 로그는 제외하고 저장했습니다.'
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
