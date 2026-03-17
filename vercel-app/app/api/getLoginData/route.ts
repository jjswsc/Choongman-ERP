import { NextResponse } from 'next/server'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// #region agent log
const _log = (msg: string, data?: Record<string, unknown>) => {
  try {
    const logPath = join(process.cwd(), '..', 'debug-e3767f.log')
    appendFileSync(logPath, JSON.stringify({ sessionId: 'e3767f', location: 'getLoginData/route.ts', message: msg, data: data ?? {}, timestamp: Date.now() }) + '\n')
  } catch (_) {}
}
// #endregion

/** Supabase 응답이 느린 경우 5분 캐시로 반복 요청 부하 감소 */
let _loginDataCache: { data: { users: Record<string, string[]>; vendors: string[] }; until: number } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 15_000
): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t))
}

async function getLoginDataHandler(url: string, key: string) {
  const supabase = createClient(url, key, { global: { fetch: fetchWithTimeout } })
  const empRes = await supabase.from('employees').select('store,name').order('id', { ascending: true })
  if (empRes.error) throw new Error(empRes.error.message)
  const vendorRes = await supabase.from('vendors').select('name,gps_name,type').order('id', { ascending: true })
  if (vendorRes.error) throw new Error(vendorRes.error.message)
  const empList = empRes.data as { store?: string; name?: string }[] | null
  const vendorRows = vendorRes.data as { name?: string; gps_name?: string; type?: string }[] | null
  const userMap: Record<string, string[]> = {}
  for (let i = 0; i < (empList || []).length; i++) {
    const store = String((empList as { store?: string }[])[i].store || '').trim()
    const name = String((empList as { name?: string }[])[i].name || '').trim()
    if (store && name) {
      if (!userMap[store]) userMap[store] = []
      userMap[store].push(name)
    }
  }
  const vendorList: string[] = []
  const vRows = (vendorRows || []) as { name?: string; gps_name?: string; type?: string }[]
  for (let v = 0; v < vRows.length; v++) {
    const row = vRows[v]
    const gpsName = String(row.gps_name || '').trim()
    const fullName = String(row.name || '').trim()
    const t = String(row.type || '').toLowerCase()
    const isSales = t === 'sales' || t === '매출' || t === '매출처' || t === 'both' || t === '둘 다'
    const n = (isSales && gpsName) ? gpsName : fullName
    if (n) vendorList.push(n)
  }
  return { users: userMap, vendors: vendorList }
}

export async function GET() {
  // #region agent log
  _log('GET entry', { hypothesisId: 'H1' })
  // #endregion
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  const url = (process.env.SUPABASE_URL || '').trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  // #region agent log
  _log('env check', { hasUrl: !!url, hasKey: !!key, hypothesisId: 'H4' })
  // #endregion
  if (!url || !key) {
    const msg = 'SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY가 없습니다. .env를 확인하고 개발 서버를 재시작하세요.'
    console.error('getLoginData:', msg)
    return NextResponse.json(
      { users: {}, vendors: [], error: msg },
      { status: 503, headers }
    )
  }

  try {
    const now = Date.now()
    if (_loginDataCache && _loginDataCache.until > now) {
      // #region agent log
      _log('cache hit', { hypothesisId: 'H5' })
      // #endregion
      return NextResponse.json(_loginDataCache.data, { headers })
    }
    // #region agent log
    _log('before getLoginDataHandler', { hypothesisId: 'H2' })
    // #endregion
    const data = await getLoginDataHandler(url, key)
    _loginDataCache = { data, until: now + CACHE_TTL_MS }
    // #region agent log
    _log('getLoginDataHandler success', { userCount: Object.keys(data.users ?? {}).length, vendorCount: (data.vendors ?? []).length, hypothesisId: 'H5' })
    // #endregion
    return NextResponse.json(data, { headers })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    const msg = err.message
    // #region agent log
    _log('getLoginDataHandler error', {
      message: msg,
      cause: err.cause ? String(err.cause) : undefined,
      causeCode: (err.cause as { code?: string })?.code,
      name: err.name,
      hypothesisId: 'H2',
    })
    // #endregion
    console.error('getLoginData:', e)
    return NextResponse.json(
      { users: {}, vendors: [], error: msg },
      { status: 503, headers }
    )
  }
}
