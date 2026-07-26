import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  fetchEmployeesForLoginList,
  fetchEmployeesForLoginListScoped,
} from '@/lib/login-data-employees-server'
import { enrichStoreListWithGrabMap } from '@/lib/erp-store-list-grab-enrich'
import {
  buildStoreListFromEmployees,
  fetchErpStoresMaster,
  fetchErpStoresMasterForTenant,
} from '@/lib/erp-store-master'
import { legacyEmployeeStoreToCanonicalWithMap } from '@/lib/erp-store-master-shared'
import {
  getLoginDataCachedPayload,
  getLoginDataStalePayload,
  loginDataCacheScopeKey,
  markLoginDataCacheValid,
} from '@/lib/login-data-cache-server'
import { loadSaasLoginStoreEntries } from '@/lib/saas-tenant-stores-server'
import { isLoginExcludedStoreKey } from '@/lib/pos-sales-test-office'
import { isServerSaasBrand } from '@/lib/app-brand-server'
import { resolveSaasTenantForLogin } from '@/lib/saas-login-tenant-resolve'
import { normalizeCompanyName, normalizeTenantId } from '@/lib/tenant-context'
import { dedupeLoginUsersByDisplayLabel } from '@/lib/store-list-keys'
import { simpleRateLimit } from '@/lib/simple-rate-limit'

type LoginDataPayload = {
  users: Record<string, string[]>
  vendors: string[]
  companies: string[]
  storeCompanies: Record<string, string>
  storeLabels: Record<string, string>
  legacyToCanonical: Record<string, string>
  usedMaster: boolean
  error?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const EDGE_CACHE_SEC = 300
/** SaaS: IP당 분당 요청 (회사명 스캔·직원목록 남용 완화) */
const SAAS_LOGIN_DATA_RATE_MAX = 30
const SAAS_LOGIN_DATA_RATE_WINDOW_MS = 60_000

function clientIpFromRequest(req: NextRequest): string {
  const fwd = String(req.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    ?.trim()
  if (fwd) return fwd
  const real = String(req.headers.get('x-real-ip') || '').trim()
  if (real) return real
  return 'unknown'
}

function emptyPayload(error?: string): LoginDataPayload {
  return {
    users: {},
    vendors: [],
    companies: [],
    storeCompanies: {},
    storeLabels: {},
    legacyToCanonical: {},
    usedMaster: false,
    ...(error ? { error } : {}),
  }
}

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return headers
}

function loginDataSuccessHeaders(opts: { saasScoped: boolean }): Headers {
  const headers = corsHeaders()
  if (opts.saasScoped) {
    headers.set('Cache-Control', 'private, no-store')
    headers.set('CDN-Cache-Control', 'no-store')
    headers.set('Vercel-CDN-Cache-Control', 'no-store')
    return headers
  }
  headers.set('Cache-Control', `public, s-maxage=${EDGE_CACHE_SEC}, stale-while-revalidate=600`)
  headers.set('CDN-Cache-Control', `public, s-maxage=${EDGE_CACHE_SEC}`)
  headers.set('Vercel-CDN-Cache-Control', `public, s-maxage=${EDGE_CACHE_SEC}`)
  return headers
}

function buildVendorList(
  vendorRows: { name?: string; gps_name?: string; type?: string }[] | null
): string[] {
  const vendorList: string[] = []
  for (const row of vendorRows || []) {
    const gpsName = String(row.gps_name || '').trim()
    const fullName = String(row.name || '').trim()
    const t = String(row.type || '').toLowerCase()
    const isSales = t === 'sales' || t === '매출' || t === '매출처' || t === 'both' || t === '둘 다'
    const n = isSales && gpsName ? gpsName : fullName
    if (n) vendorList.push(n)
  }
  return vendorList
}

async function loadVendorsForScope(opts: {
  saas: boolean
  tenantId?: string
}): Promise<{ name?: string; gps_name?: string; type?: string }[]> {
  if (opts.saas && opts.tenantId) {
    try {
      return (await supabaseSelectFilter(
        'vendors',
        `tenant_id=eq.${encodeURIComponent(opts.tenantId)}`,
        {
          select: 'name,gps_name,type',
          order: 'id.asc',
          limit: 10000,
        }
      )) as { name?: string; gps_name?: string; type?: string }[]
    } catch {
      /** Omni: tenant 필터 실패 시 전역 노출 금지 */
      return []
    }
  }
  if (opts.saas) return []
  try {
    return (await supabaseSelect('vendors', {
      select: 'name,gps_name,type',
      order: 'id.asc',
      limit: 10000,
    })) as { name?: string; gps_name?: string; type?: string }[]
  } catch {
    return []
  }
}

async function getLoginDataHandler(opts: {
  saas: boolean
  tenantId?: string
  companyName?: string
}): Promise<LoginDataPayload> {
  const tenantId = normalizeTenantId(opts.tenantId)
  const companyName = normalizeCompanyName(opts.companyName)

  const [empList, masters, vendorRows, saasStores] = await Promise.all([
    opts.saas
      ? fetchEmployeesForLoginListScoped({ tenantId, company: companyName })
      : fetchEmployeesForLoginList(),
    opts.saas && tenantId
      ? fetchErpStoresMasterForTenant(tenantId, companyName)
      : fetchErpStoresMaster(),
    loadVendorsForScope({ saas: opts.saas, tenantId }),
    opts.saas
      ? loadSaasLoginStoreEntries({ tenantId, companyName })
      : loadSaasLoginStoreEntries(),
  ])

  const built = enrichStoreListWithGrabMap(
    buildStoreListFromEmployees(empList, masters, { includeResignedInUserMap: true }),
    masters
  )

  const vendorList = buildVendorList(vendorRows)

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
  /**
   * SaaS 매장은 셀렉트 value를 store_code 하나로만 둔다.
   * store_name을 별도 키로 넣으면(코드≠이름) 라벨이 같아 드롭다운에 "1001"이 두 번 보인다.
   */
  for (const entry of saasStores) {
    if (!entry.storeName || isLoginExcludedStoreKey(entry.storeName)) continue
    const code = String(entry.storeCode || '').trim()
    const loginKey = code && !isLoginExcludedStoreKey(code) ? code : entry.storeName
    if (!loginKey || isLoginExcludedStoreKey(loginKey)) continue

    const fromName =
      loginKey !== entry.storeName && Array.isArray(users[entry.storeName])
        ? users[entry.storeName]!
        : []
    users[loginKey] = [...new Set([...(users[loginKey] || []), ...fromName])]
    if (loginKey !== entry.storeName) {
      delete users[entry.storeName]
      delete storeCompanies[entry.storeName]
      delete storeLabels[entry.storeName]
    }
    if (!storeCompanies[loginKey]) storeCompanies[loginKey] = entry.companyName
    storeLabels[loginKey] = entry.storeName
    if (entry.companyName && !companies.includes(entry.companyName)) companies.push(entry.companyName)
  }
  dedupeLoginUsersByDisplayLabel(users, storeLabels, storeCompanies)
  if (companyName && !companies.includes(companyName)) companies.push(companyName)
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

export async function GET(req: NextRequest) {
  const errorHeaders = corsHeaders()
  errorHeaders.set('Cache-Control', 'no-store')

  const url = (process.env.SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    const msg =
      'SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY가 없습니다. .env를 확인하고 개발 서버를 재시작하세요.'
    console.error('getLoginData:', msg)
    return NextResponse.json(emptyPayload(msg), { status: 503, headers: errorHeaders })
  }

  const saas = await isServerSaasBrand()
  const companyQ = normalizeCompanyName(req.nextUrl.searchParams.get('company'))
  const tenantQ = normalizeTenantId(req.nextUrl.searchParams.get('tenantId'))

  if (saas) {
    const ip = clientIpFromRequest(req)
    const rl = simpleRateLimit(`getLoginData:${ip}`, SAAS_LOGIN_DATA_RATE_MAX, SAAS_LOGIN_DATA_RATE_WINDOW_MS)
    if (!rl.ok) {
      const h = corsHeaders()
      h.set('Cache-Control', 'no-store')
      h.set('Retry-After', String(Math.max(1, Math.ceil(rl.retryAfterMs / 1000))))
      return NextResponse.json(emptyPayload('rate_limited'), { status: 429, headers: h })
    }
  }

  let scopeTenantId = ''
  let scopeCompany = ''
  if (saas) {
    if (!companyQ && !tenantQ) {
      return NextResponse.json(emptyPayload('company_required'), {
        status: 400,
        headers: loginDataSuccessHeaders({ saasScoped: true }),
      })
    }
    const resolved = await resolveSaasTenantForLogin({ company: companyQ, tenantId: tenantQ })
    if (!resolved) {
      return NextResponse.json(emptyPayload('company_not_found'), {
        status: 404,
        headers: loginDataSuccessHeaders({ saasScoped: true }),
      })
    }
    if (resolved.isActive === false) {
      return NextResponse.json(emptyPayload('company_inactive'), {
        status: 403,
        headers: loginDataSuccessHeaders({ saasScoped: true }),
      })
    }
    scopeTenantId = resolved.tenantId
    scopeCompany = resolved.companyName || companyQ
  }

  const scopeKey = loginDataCacheScopeKey(saas ? scopeTenantId || scopeCompany : 'legacy-global')
  const successHeaders = loginDataSuccessHeaders({ saasScoped: saas })

  try {
    const cached = getLoginDataCachedPayload<LoginDataPayload>(scopeKey)
    if (cached) {
      return NextResponse.json(cached, { headers: successHeaders })
    }
    const data = await getLoginDataHandler({
      saas,
      tenantId: scopeTenantId || undefined,
      companyName: scopeCompany || undefined,
    })
    markLoginDataCacheValid(CACHE_TTL_MS, scopeKey, data)
    return NextResponse.json(data, { headers: successHeaders })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const msg = err.message
    console.error('getLoginData:', e)
    const stale = getLoginDataStalePayload<LoginDataPayload>(scopeKey)
    if (stale) {
      console.warn('getLoginData: serving stale in-process cache after fetch failure')
      return NextResponse.json(stale, { headers: successHeaders })
    }
    return NextResponse.json(emptyPayload(msg), { status: 503, headers: errorHeaders })
  }
}
