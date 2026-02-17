import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { isOfficeStore, OFFICE_STORES } from '@/lib/permissions'

function toDateStr(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 10)
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** 연차 표시용: DB에 직접 입력된 값(>0) 우선. null/0이면 근속연수 기반 계산 (Hourly=0, 1년↑6일, 2년↑7일...) */
function getAnnualLeaveDaysForDisplay(r: Record<string, unknown>): number {
  const directVal = r.annual_leave_days
  if (directVal != null && directVal !== '' && Number(directVal) > 0) {
    const n = Number(directVal)
    if (!Number.isNaN(n) && n >= 0) return n
  }
  const salType = String(r.sal_type ?? '').trim()
  if (salType.toLowerCase() === 'hourly') return 0
  const joinStr = toDateStr(r.join_date)
  if (!joinStr) return 0
  const joinDate = new Date(joinStr + 'T12:00:00')
  if (isNaN(joinDate.getTime())) return 0
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000
  const fullYears = Math.floor((Date.now() - joinDate.getTime()) / msPerYear)
  if (fullYears < 1) return 0
  return 6 + (fullYears - 1)
}

/** 직원 관리용 직원 목록. userStore/userRole로 필터링 */
export async function GET(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(req.url)
    const userStore = String(searchParams.get('userStore') || '').trim()
    const userRole = String(searchParams.get('userRole') || '').toLowerCase()

    const rows = (await supabaseSelect('employees', { order: 'id.asc' })) as Record<string, unknown>[] | null
    const role = userRole
    const list: Record<string, unknown>[] = []

    for (const r of rows || []) {
      if (!r.store && !r.name) continue
      const empStore = String(r.store || '').trim()
      let include = false
      if (role.includes('director') || role.includes('ceo') || role.includes('hr')) {
        include = true
      } else if (role.includes('officer')) {
        if (!isOfficeStore(empStore)) include = true
      } else if (role.includes('manager')) {
        if (empStore === userStore) include = true
      } else {
        if (empStore === userStore) include = true
      }
      if (!include) continue
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
        annualLeaveDays: getAnnualLeaveDaysForDisplay(r),
        bankName: r.bank_name != null ? String(r.bank_name).trim() : '',
        accountNumber: r.account_number != null ? String(r.account_number).trim() : '',
        positionAllowance: r.position_allowance != null ? Number(r.position_allowance) : 0,
        riskAllowance: r.haz_allow != null ? Number(r.haz_allow) : 0,
        grade: r.grade != null && r.grade !== '' ? String(r.grade).trim() : '',
        photo: r.photo != null && r.photo !== '' ? String(r.photo).trim() : '',
      })
    }

    const storeSet = new Set((rows || []).map((r) => String(r.store || '').trim()).filter(Boolean))
    let allStores = Array.from(storeSet).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      if (OFFICE_STORES.some((s) => aLower.includes(s.toLowerCase()))) return -1
      if (OFFICE_STORES.some((s) => bLower.includes(s.toLowerCase()))) return 1
      return a.localeCompare(b)
    })
    const canSeeOffice = role.includes('director') || role.includes('ceo') || role.includes('hr')
    if (!canSeeOffice) {
      allStores = allStores.filter((st) => !isOfficeStore(st))
    }

    return NextResponse.json({ list, stores: allStores }, { headers })
  } catch (e) {
    console.error('getAdminEmployeeList:', e)
    return NextResponse.json({ list: [], stores: [] }, { status: 500, headers })
  }
}
