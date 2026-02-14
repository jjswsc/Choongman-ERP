import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']

function isOfficeStore(st: string) {
  const x = String(st || '').trim()
  return x === '본사' || x === 'Office' || x === '오피스' || x.toLowerCase() === 'office'
}

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

    const rows = (await supabaseSelect('employees', { order: 'id.asc' })) as Record<string, unknown>[] | null
    const role = userRole
    const list: Record<string, unknown>[] = []

    for (const r of rows || []) {
      if (!r.store && !r.name) continue
      const empStore = String(r.store || '').trim()
      let include = false
      if (role.includes('director')) include = true
      else if (role.includes('ceo') || role.includes('hr') || role.includes('officer')) {
        if (!isOfficeStore(empStore)) include = true
      } else if (role.includes('manager')) {
        if (!isOfficeStore(empStore)) include = true
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
        pw: r.password,
        role: r.role || 'Staff',
        email: r.email || '',
        annualLeaveDays:
          r.annual_leave_days != null && r.annual_leave_days !== ''
            ? Number(r.annual_leave_days)
            : 15,
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
      if (OFFICE_STORES.some((s) => a.toLowerCase().includes(s.toLowerCase()))) return -1
      if (OFFICE_STORES.some((s) => b.toLowerCase().includes(s.toLowerCase()))) return 1
      return a.localeCompare(b)
    })
    const canSeeOffice = role.includes('director')
    if (!canSeeOffice) {
      allStores = allStores.filter((st) => !isOfficeStore(st))
    }

    return NextResponse.json({ list, stores: allStores }, { headers })
  } catch (e) {
    console.error('getAdminEmployeeList:', e)
    return NextResponse.json({ list: [], stores: [] }, { status: 500, headers })
  }
}
