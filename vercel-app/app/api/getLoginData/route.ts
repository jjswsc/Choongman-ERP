import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { fetchEmployeesForLoginList } from '@/lib/login-data-employees-server'
import { enrichStoreListWithGrabMap } from '@/lib/erp-store-list-grab-enrich'
import { buildStoreListFromEmployees, fetchErpStoresMaster } from '@/lib/erp-store-master'
import { legacyEmployeeStoreToCanonicalWithMap } from '@/lib/erp-store-master-shared'
import {
  isLoginDataCacheValid,
  markLoginDataCacheValid,
} from '@/lib/login-data-cache-server'
import { loadSaasLoginStoreEntries } from '@/lib/saas-tenant-stores-server'
import { isLoginExcludedStoreKey } from '@/lib/pos-sales-test-office'

type LoginDataPayload = {
  users: Record<string, string[]>
  vendors: string[]
  companies: string[]
  storeCompanies: Record<string, string>
  storeLabels: Record<string, string>
  legacyToCanonical: Record<string, string>
  usedMaster: boolean
}

/** Supabase 응답이 느린 경우 5분 캐시로 반복 요청 부하 감소 */
let _loginDataCache: LoginDataPayload | null = null
const CACHE_TTL_MS = 5 * 60 * 1000
const EDGE_CACHE_SEC = 300

function loginDataSuccessHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Cache-Control', `public, s-maxage=${EDGE_CACHE_SEC}, stale-while-revalidate=600`)
  headers.set('CDN-Cache-Control', `public, s-maxage=${EDGE_CACHE_SEC}`)
  headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${EDGE_CACHE_SEC}`)
  return headers
}

async function getLoginDataHandler(): Promise<LoginDataPayload> {
  const empList = await fetchEmployeesForLoginList()

  /** 매장 마스터·거래처는 직원 목록과 독립 → 병렬로 왕복 1회 절감 (직원 조회는 반드시 선행) */
  const [masters, vendorRows] = await Promise.all([
    fetchErpStoresMaster(),
    supabaseSelect('vendors', {
      select: 'name,gps_name,type',
      order: 'id.asc',
      limit: 10000,
    }) as Promise<{ name?: string; gps_name?: string; type?: string }[] | null>,
  ])

  const built = enrichStoreListWithGrabMap(
    buildStoreListFromEmployees(empList, masters, { includeResignedInUserMap: true }),
    masters
  )

  const vendorList: string[] = []
  const vRows = vendorRows || []
  for (let v = 0; v < vRows.length; v++) {
    const row = vRows[v]
    const gpsName = String(row.gps_name || '').trim()
    const fullName = String(row.name || '').trim()
    const t = String(row.type || '').toLowerCase()
    const isSales = t === 'sales' || t === '매출' || t === '매출처' || t === 'both' || t === '둘 다'
    const n = isSales && gpsName ? gpsName : fullName
    if (n) vendorList.push(n)
  }

  const companies = Array.from(
    new Set((empList || []).map((r) => String(r.company || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))
  const storeCompanies: Record<string, string> = {}
  for (const row of empList || []) {
    const rawStore = String(row.store || '').trim()
    const c = String(row.company || '').trim()
    if (!rawStore || !c) continue
    const canon = legacyEmployeeStoreToCanonicalWithMap(rawStore, built.legacyToCanonical, built.usedMaster)
    for (const key of new Set([rawStore, canon].filter(Boolean))) {
      if (!storeCompanies[key]) storeCompanies[key] = c
    }
  }

  const users: Record<string, string[]> = {}
  for (const [storeKey, names] of Object.entries(built.users)) {
    if (!names?.length) continue
    if (isLoginExcludedStoreKey(storeKey)) continue
    users[storeKey] = names
  }

  const storeLabels: Record<string, string> = { ...built.storeLabels }
  const saasStores = await loadSaasLoginStoreEntries()
  for (const entry of saasStores) {
    if (!entry.storeName || isLoginExcludedStoreKey(entry.storeName)) continue
    if (!users[entry.storeName]) users[entry.storeName] = []
    if (!storeCompanies[entry.storeName]) storeCompanies[entry.storeName] = entry.companyName
    if (entry.storeCode && entry.storeCode !== entry.storeName) {
      if (!users[entry.storeCode]) users[entry.storeCode] = users[entry.storeName]!
      if (!storeCompanies[entry.storeCode]) storeCompanies[entry.storeCode] = entry.companyName
      storeLabels[entry.storeCode] = entry.storeName
    }
    if (!storeLabels[entry.storeName]) storeLabels[entry.storeName] = entry.storeName
    if (entry.companyName && !companies.includes(entry.companyName)) companies.push(entry.companyName)
  }
  companies.sort((a, b) => a.localeCompare(b))

  return {
    users,
    vendors: vendorList,
    companies,
    storeCompanies,
    storeLabels,
    legacyToCanonical: built.legacyToCanonical,
    usedMaster: built.usedMaster,
  }
}

export async function GET() {
  const errorHeaders = new Headers()
  errorHeaders.set('Access-Control-Allow-Origin', '*')
  errorHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  errorHeaders.set('Access-Control-Allow-Headers', 'Content-Type')
  errorHeaders.set('Cache-Control', 'no-store')

  const url = (process.env.SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    const msg =
      'SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY가 없습니다. .env를 확인하고 개발 서버를 재시작하세요.'
    console.error('getLoginData:', msg)
    return NextResponse.json(
      {
        users: {},
        vendors: [],
        companies: [],
        storeCompanies: {},
        storeLabels: {},
        legacyToCanonical: {},
        usedMaster: false,
        error: msg,
      },
      { status: 503, headers: errorHeaders }
    )
  }

  try {
    if (isLoginDataCacheValid() && _loginDataCache) {
      return NextResponse.json(_loginDataCache, { headers: loginDataSuccessHeaders() })
    }
    const data = await getLoginDataHandler()
    _loginDataCache = data
    markLoginDataCacheValid(CACHE_TTL_MS)
    return NextResponse.json(data, { headers: loginDataSuccessHeaders() })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const msg = err.message
    console.error('getLoginData:', e)
    if (_loginDataCache) {
      console.warn('getLoginData: serving stale in-process cache after fetch failure')
      return NextResponse.json(_loginDataCache, { headers: loginDataSuccessHeaders() })
    }
    return NextResponse.json(
      {
        users: {},
        vendors: [],
        companies: [],
        storeCompanies: {},
        storeLabels: {},
        legacyToCanonical: {},
        usedMaster: false,
        error: msg,
      },
      { status: 503, headers: errorHeaders }
    )
  }
}
