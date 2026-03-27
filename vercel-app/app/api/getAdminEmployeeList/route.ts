import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { isOfficeStore, OFFICE_STORES, isAccountingRole } from '@/lib/permissions'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'

function toDateStr(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 직원 관리용 직원 목록. userStore/userRole로 필터링 */
export async function GET(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const userStore = String(searchParams.get('userStore') || '').trim()
    const userRole = String(searchParams.get('userRole') || '').toLowerCase()
    const forPettyTransfer =
      searchParams.get('forPettyTransfer') === '1' || searchParams.get('forPettyTransfer') === 'true'

    const empSelectFull = 'id,store,name,nick,phone,job,birth,nation,join_date,resign_date,sal_type,sal_amt,role,email,id_number,id_card_photo,tax_id,sso_number,address,bank_name,account_number,position_allowance,haz_allow,grade,photo'
    const empSelectFallback = 'id,store,name,nick,phone,job,birth,nation,join_date,resign_date,sal_type,sal_amt,role,email,id_number,address,bank_name,account_number,position_allowance,haz_allow,grade,photo'
    let rows: Record<string, unknown>[] | null = null
    try {
      rows = (await supabaseSelect('employees', { order: 'id.asc', select: empSelectFull, limit: 5000 })) as Record<string, unknown>[] | null
    } catch (colErr) {
      const errMsg = colErr instanceof Error ? colErr.message : String(colErr)
      if (/column.*(id_number|id_card_photo|tax_id|sso_number|address).*does not exist/i.test(errMsg) || /does not exist/i.test(errMsg)) {
        rows = (await supabaseSelect('employees', { order: 'id.asc', select: empSelectFallback, limit: 5000 })) as Record<string, unknown>[] | null
      } else {
        throw colErr
      }
    }
    const role = userRole
    const list: Record<string, unknown>[] = []

    for (const r of rows || []) {
      if (!r.store && !r.name) continue
      const empStore = String(r.store || '').trim()
      if (!userCanAccessEmployeeStore(role, userStore, empStore, { forPettyTransfer })) continue
      list.push({
        row: r.id,
        store: empStore,
        name: r.name,
        nick: r.nick || '',
        phone: r.phone || '',
        job: r.job || '',
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
        address: r.address != null ? String(r.address).trim() : '',
        bankName: r.bank_name != null ? String(r.bank_name).trim() : '',
        accountNumber: r.account_number != null ? String(r.account_number).trim() : '',
        positionAllowance: r.position_allowance != null ? Number(r.position_allowance) : 0,
        riskAllowance: r.haz_allow != null ? Number(r.haz_allow) : 0,
        grade: r.grade != null && r.grade !== '' ? String(r.grade).trim() : '',
        photo: r.photo != null && r.photo !== '' ? String(r.photo).trim() : '',
      })
    }

    const jobSet = new Set<string>()
    for (const r of rows || []) {
      const j = String(r.job || r.role || '').trim()
      if (j && j !== '매장명' && j !== 'Store' && j !== '직급' && j !== 'Job' && j !== '부서') jobSet.add(j)
    }
    const allJobOptions = Array.from(jobSet).sort((a, b) => a.localeCompare(b))

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

    const body: { list: Record<string, unknown>[]; stores: string[]; jobOptions?: string[]; _debug?: Record<string, unknown> } = {
      list,
      stores: allStores,
      jobOptions: allJobOptions.length > 0 ? allJobOptions : ['Service', 'Kitchen', 'Officer', 'Director', 'Logistic'],
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
