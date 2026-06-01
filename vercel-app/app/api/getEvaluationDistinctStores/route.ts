import { NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

const EVAL_DISTINCT_STORE_SCAN_MAX_ROWS = 1_000_000

/**
 * RPC 미배포 시: evaluation_results 전 페이지 스캔으로 매장명 수집(느리지만 RPC 없이 동작).
 */
async function distinctStoresFromTableScan(): Promise<string[]> {
  const rows = (await supabaseSelectFilterAllPages(
    'evaluation_results',
    'store_name=not.is.null',
    {
      order: 'store_name.asc,id.asc',
      select: 'store_name',
      pageSize: 5000,
      maxRows: EVAL_DISTINCT_STORE_SCAN_MAX_ROWS,
    }
  )) as { store_name?: string }[]
  const set = new Set<string>()
  for (const r of rows || []) {
    const s = String(r?.store_name ?? '').trim()
    if (s) set.add(s)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/**
 * evaluation_results 에 실제로 있는 매장명 (직원 마스터와 표기가 다를 때도 목록에 노출).
 * 1) `get_evaluation_distinct_store_names` RPC 권장 2) 실패 시 테이블 스캔 폴백
 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = await supabaseRpc<Array<{ store_name?: string }>>('get_evaluation_distinct_store_names', {})
    const list = (Array.isArray(rows) ? rows : [])
      .map((r) => String(r?.store_name ?? '').trim())
      .filter(Boolean)
    const stores = [...new Set(list)].sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ stores, source: 'rpc' as const }, { headers })
  } catch {
    try {
      const stores = await distinctStoresFromTableScan()
      return NextResponse.json({ stores, source: 'scan' as const }, { headers })
    } catch {
      return NextResponse.json({ stores: [], source: 'none' as const }, { headers })
    }
  }
}
