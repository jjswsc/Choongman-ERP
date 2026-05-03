import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { buildStoreListFromEmployees, fetchErpStoresMaster } from '@/lib/erp-store-master'

/** 매장·직원 목록 경량 조회 (store,name,nick) — erp_stores 가 있으면 store_code 기준·표시명은 storeLabels */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const empList = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name,nick,job,role,resign_date,employment_status',
    })) as {
      store?: string
      name?: string
      nick?: string
      job?: string
      role?: string
      resign_date?: string | null
      employment_status?: string | null
    }[] | null

    const masters = await fetchErpStoresMaster()
    const built = buildStoreListFromEmployees(empList, masters)

    return NextResponse.json(
      {
        stores: built.stores,
        users: built.users,
        staffByStore: built.staffByStore,
        storeLabels: built.storeLabels,
        legacyToCanonical: built.legacyToCanonical,
        usedMaster: built.usedMaster,
      },
      { headers }
    )
  } catch (e) {
    console.error('getStoreList:', e)
    return NextResponse.json(
      { stores: [], users: {}, staffByStore: {}, storeLabels: {}, legacyToCanonical: {}, usedMaster: false },
      { headers }
    )
  }
}
