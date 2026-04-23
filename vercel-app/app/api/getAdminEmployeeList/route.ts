import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectPageCap } from '@/lib/supabase-server'
import { isOfficeStore, OFFICE_STORES, isAccountingRole, isFranchiseeRole } from '@/lib/permissions'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import { requireAuth } from '@/lib/verify-auth'
import { franchiseeQueryStoreAllowed, normalizedAllowedStoresFromJwt } from '@/lib/franchisee-multi-store'
import { parseExtraStoresColumn } from '@/lib/extra-stores-column'
import { normalizeEmployeeNameFields } from '@/lib/employee-display-name'
import {
  DEFAULT_EMPLOYEE_JOB_CATALOG,
  loadEmployeeJobCatalog,
  mergeJobOptionsFromCatalogAndEmployees,
} from '@/lib/employee-job-catalog'

export const dynamic = 'force-dynamic'

function toDateStr(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function normalizedEmployeeStatus(val: unknown, resignDate: unknown): 'active' | 'leave' | 'resigned' | 'suspended' {
  const raw = String(val || '')
    .trim()
    .toLowerCase()
  if (raw === 'active' || raw === 'leave' || raw === 'resigned' || raw === 'suspended') return raw
  return String(resignDate || '').trim() ? 'resigned' : 'active'
}

/** 직원 관리용 직원 목록. userStore/userRole로 필터링 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  try {
    const authResult = await requireAuth(req, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const { searchParams } = new URL(req.url)
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const forPettyTransfer =
      searchParams.get('forPettyTransfer') === '1' || searchParams.get('forPettyTransfer') === 'true'
    const rawSearch = String(searchParams.get('search') || '').trim().toLowerCase()
    const statusFilter = String(searchParams.get('status') || '').trim().toLowerCase()
    const storeFilter = String(searchParams.get('store') || '').trim()
    const jobFilter = String(searchParams.get('job') || '').trim()
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1)
    const pageSizeRaw = Number(searchParams.get('pageSize') || 0) || 0
    const pageSize = Math.max(1, Math.min(pageSizeRaw, 500))
    const usePagination = pageSizeRaw > 0

    const jwt = auth
    const effectiveRole = String(jwt?.role || userRole || '')
      .toLowerCase()
      .trim()
    if (jwt && isFranchiseeRole(effectiveRole) && !franchiseeQueryStoreAllowed(jwt, userStore)) {
      return NextResponse.json(
        { list: [], stores: [], jobOptions: [], message: '선택한 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }
    const franchiseeAllowedList =
      jwt && isFranchiseeRole(jwt.role || '') ? normalizedAllowedStoresFromJwt(jwt) : undefined

    const empSelectFull =
      'id,store,name,nick,name_title,phone,job,birth,nation,join_date,resign_date,sal_type,sal_amt,role,email,id_number,id_card_photo,tax_id,sso_number,sso_exempt,address,bank_name,account_number,position_allowance,haz_allow,attendance_allowance,grade,photo,extra_stores,employee_code,employment_status,deleted_at'
    const empSelectFullNoStatus = empSelectFull.replace(',employment_status,deleted_at', '')
    const empSelectFallback =
      'id,store,name,nick,phone,job,birth,nation,join_date,resign_date,sal_type,sal_amt,role,email,id_number,address,bank_name,account_number,position_allowance,haz_allow,grade,photo,employee_code'
    /** employee_code 컬럼 미배포 DB용 */
    const empSelectFallbackNoEmpCode =
      'id,store,name,nick,phone,job,birth,nation,join_date,resign_date,sal_type,sal_amt,role,email,id_number,address,bank_name,account_number,position_allowance,haz_allow,grade,photo'
    let rows: Record<string, unknown>[] | null = null
    const empSelectFullNoExtra = empSelectFull.replace(',extra_stores', '')
    const empSelectFullNoSsoExempt = empSelectFull.replace(',sso_exempt', '')
    const empSelectFullNoExtraNoSsoExempt = empSelectFullNoExtra.replace(',sso_exempt', '')
    const empSelectFullNoStatusNoSsoExempt = empSelectFullNoStatus.replace(',sso_exempt', '')
    const empSelectFullNoStatusNoExtra = empSelectFullNoStatus.replace(',extra_stores', '')
    const empSelectCandidates = [
      empSelectFull,
      empSelectFullNoStatus,
      empSelectFullNoSsoExempt,
      empSelectFullNoExtra,
      empSelectFullNoExtraNoSsoExempt,
      empSelectFullNoStatusNoSsoExempt,
      empSelectFullNoStatusNoExtra,
      empSelectFallback,
      empSelectFallbackNoEmpCode,
    ]
    let loadErr: unknown = null
    const empFetchLimit = supabaseSelectPageCap()
    for (const sel of empSelectCandidates) {
      try {
        rows = (await supabaseSelect('employees', { order: 'id.asc', select: sel, limit: empFetchLimit })) as Record<
          string,
          unknown
        >[] | null
        loadErr = null
        break
      } catch (e) {
        loadErr = e
      }
    }
    if (loadErr) throw loadErr
    const role = effectiveRole
    const list: Record<string, unknown>[] = []

    for (const r of rows || []) {
      if (!r.store && !r.name) continue
      const deletedAt = r.deleted_at != null ? String(r.deleted_at).trim() : ''
      if (deletedAt) continue
      const empStore = String(r.store || '').trim()
      if (
        !userCanAccessEmployeeStore(role, userStore, empStore, {
          forPettyTransfer,
          allowedStores:
            franchiseeAllowedList && franchiseeAllowedList.length > 0 ? franchiseeAllowedList : undefined,
        })
      )
        continue
      const rawName = r.name != null ? String(r.name).trim() : ''
      const rawTitle = r.name_title != null ? String(r.name_title).trim() : ''
      const { name: normName, nameTitle: normTitle } = normalizeEmployeeNameFields(rawName, rawTitle)
      const employmentStatus = normalizedEmployeeStatus(r.employment_status, r.resign_date)
      const employeeCode = r.employee_code != null ? String(r.employee_code).trim() : ''
      const phone = r.phone != null ? String(r.phone).trim() : ''
      const nick = r.nick != null ? String(r.nick).trim() : ''
      const job = r.job != null ? String(r.job).trim() : ''
      if (storeFilter && storeFilter !== 'All' && empStore !== storeFilter) continue
      if (jobFilter && jobFilter !== 'All' && job !== jobFilter) continue
      if (statusFilter && statusFilter !== 'all' && employmentStatus !== statusFilter) continue
      if (rawSearch) {
        const haystack = [normName || rawName, nick, employeeCode, phone].join(' ').toLowerCase()
        if (!haystack.includes(rawSearch)) continue
      }
      list.push({
        row: r.id,
        store: empStore,
        name: normName || rawName,
        nameTitle: normTitle,
        employeeCode,
        nick,
        phone,
        job,
        birth: toDateStr(r.birth),
        nation: r.nation || '',
        join: toDateStr(r.join_date),
        resign: toDateStr(r.resign_date),
        salType: r.sal_type || 'Monthly',
        salAmt: r.sal_amt || 0,
        pw: '', // 비밀번호는 클라이언트에 전달하지 않음 (변경 시에만 입력)
        role: r.role || 'Staff',
        email: r.email || '',
        idNumber: r.id_number != null ? String(r.id_number).trim() : '',
        idCardPhoto: r.id_card_photo != null && String(r.id_card_photo).trim() ? String(r.id_card_photo).trim() : '',
        taxId: r.tax_id != null ? String(r.tax_id).trim() : '',
        ssoNumber: r.sso_number != null ? String(r.sso_number).trim() : '',
        ssoExempt: r.sso_exempt === true || r.sso_exempt === 'true' || r.sso_exempt === 1,
        address: r.address != null ? String(r.address).trim() : '',
        bankName: r.bank_name != null ? String(r.bank_name).trim() : '',
        accountNumber: r.account_number != null ? String(r.account_number).trim() : '',
        positionAllowance: r.position_allowance != null ? Number(r.position_allowance) : 0,
        riskAllowance: r.haz_allow != null ? Number(r.haz_allow) : 0,
        attendanceAllowance:
          r.attendance_allowance != null && r.attendance_allowance !== ''
            ? Number(r.attendance_allowance)
            : 500,
        grade: r.grade != null && r.grade !== '' ? String(r.grade).trim() : '',
        photo: r.photo != null && r.photo !== '' ? String(r.photo).trim() : '',
        extraStores: parseExtraStoresColumn(r.extra_stores),
        employmentStatus,
      })
    }

    const jobSet = new Set<string>()
    for (const r of rows || []) {
      const j = String(r.job || r.role || '').trim()
      if (j && j !== '매장명' && j !== 'Store' && j !== '직급' && j !== 'Job' && j !== '부서') jobSet.add(j)
    }
    const fromEmpJobs = Array.from(jobSet)
    let catalog: string[] = [...DEFAULT_EMPLOYEE_JOB_CATALOG]
    try {
      catalog = await loadEmployeeJobCatalog()
    } catch {
      catalog = [...DEFAULT_EMPLOYEE_JOB_CATALOG]
    }
    const mergedJobOpts = mergeJobOptionsFromCatalogAndEmployees(catalog, fromEmpJobs)
    const allJobOptions =
      mergedJobOpts.length > 0 ? mergedJobOpts : [...DEFAULT_EMPLOYEE_JOB_CATALOG]

    const storeSet = new Set((rows || []).map((r) => String(r.store || '').trim()).filter(Boolean))
    let allStores = Array.from(storeSet).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      if (OFFICE_STORES.some((s) => aLower.includes(s.toLowerCase()))) return -1
      if (OFFICE_STORES.some((s) => bLower.includes(s.toLowerCase()))) return 1
      return a.localeCompare(b)
    })
    const canSeeOffice = role.includes('director') || role.includes('ceo') || role.includes('hr') || isAccountingRole(role)
    if (!canSeeOffice) {
      allStores = allStores.filter((st) => !isOfficeStore(st))
    }

    const total = list.length
    const pagedList = usePagination ? list.slice((page - 1) * pageSize, page * pageSize) : list
    const body: {
      list: Record<string, unknown>[]
      stores: string[]
      jobOptions?: string[]
      pageInfo?: { page: number; pageSize: number; total: number; hasNext: boolean }
      _debug?: Record<string, unknown>
    } = {
      list: pagedList,
      stores: allStores,
      jobOptions: allJobOptions,
      pageInfo: {
        page: usePagination ? page : 1,
        pageSize: usePagination ? pageSize : total,
        total,
        hasNext: usePagination ? page * pageSize < total : false,
      },
    }
    if (list.length === 0 && rows && rows.length > 0) {
      body._debug = {
        userStore,
        userRole,
        role,
        totalRowsFromDb: rows.length,
        sampleStores: [...new Set((rows as { store?: string }[]).map((r) => String(r.store || "").trim()).filter(Boolean))].slice(0, 5),
      }
    } else if (list.length === 0 && (!rows || rows.length === 0)) {
      body._debug = { userStore, userRole, role, totalRowsFromDb: 0, hint: "employees 테이블이 비어 있거나 조회 실패" }
    }

    return NextResponse.json(body, { headers })
  } catch (e) {
    console.error('getAdminEmployeeList:', e)
    return NextResponse.json({ list: [], stores: [] }, { status: 500, headers })
  }
}
