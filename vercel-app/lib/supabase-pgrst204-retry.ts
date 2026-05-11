import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

/** PostgREST PGRST204: Could not find the 'col' / "col" column */
export function extractPgrstMissingColumn(error: unknown): string | null {
  const msg = String(error ?? '')
  const m1 = msg.match(/Could not find the '([^']+)' column/i)
  if (m1?.[1]) return m1[1]
  const m2 = msg.match(/Could not find the "([^"]+)" column/i)
  if (m2?.[1]) return m2[1]
  return null
}

/**
 * Postgres 42703 in PostgREST body: column pos_orders.created_by does not exist
 * (스키마에 컬럼이 아직 없을 때 — 예: created_by 마이그레이션 미적용 DB)
 */
export function extractPgUndefinedColumn(error: unknown): string | null {
  const msg = String(error ?? '')
  const m = msg.match(/column\s+[\w.]+\.(\w+)\s+does not exist/i)
  return m?.[1] || null
}

function extractAnyMissingColumn(error: unknown): string | null {
  return extractPgrstMissingColumn(error) || extractPgUndefinedColumn(error)
}

export async function supabaseInsertWithPgrst204Fallback(
  table: string,
  row: Record<string, unknown>,
  logLabel: string
): Promise<unknown> {
  const working: Record<string, unknown> = { ...row }
  for (let i = 0; i < 40; i++) {
    try {
      return await supabaseInsert(table, working)
    } catch (e) {
      const missingCol = extractAnyMissingColumn(e)
      if (!missingCol || !(missingCol in working)) throw e
      delete working[missingCol]
      console.warn(`${logLabel}: skip missing column '${missingCol}'`)
    }
  }
  throw new Error(`${logLabel}: too many missing-column retries`)
}

export async function supabaseUpdateByFilterWithPgrst204Fallback(
  table: string,
  filter: string,
  patch: Record<string, unknown>,
  logLabel: string
): Promise<void> {
  const working: Record<string, unknown> = { ...patch }
  for (let i = 0; i < 40; i++) {
    try {
      await supabaseUpdateByFilter(table, filter, working)
      return
    } catch (e) {
      const missingCol = extractAnyMissingColumn(e)
      if (!missingCol || !(missingCol in working)) throw e
      delete working[missingCol]
      console.warn(`${logLabel}: skip missing column '${missingCol}'`)
    }
  }
  throw new Error(`${logLabel}: too many missing-column retries`)
}

/**
 * select 목록에 아직 없는 컬럼이 있으면 PostgREST/Postgres 오류 → 해당 컬럼만 빼고 재시도
 */
export async function supabaseSelectFilterStrippingUnknownColumns(
  table: string,
  filter: string,
  opts: { limit?: number; order?: string; select: string },
  logLabel: string
): Promise<unknown> {
  const cols = opts.select
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let use = [...cols]
  for (let i = 0; i < 40; i++) {
    try {
      return await supabaseSelectFilter(table, filter, { ...opts, select: use.join(',') })
    } catch (e) {
      const missingCol = extractAnyMissingColumn(e)
      if (!missingCol) throw e
      const next = use.filter((c) => c !== missingCol)
      if (next.length === use.length) throw e
      use = next
      console.warn(`${logLabel}: select omit missing column '${missingCol}'`)
    }
  }
  throw new Error(`${logLabel}: too many select column retries`)
}

/**
 * `supabaseSelectFilterAllPages` + 컬럼 미존재 시 select에서 해당 컬럼만 제거 후 재시도
 */
export async function supabaseSelectFilterAllPagesStrippingUnknownColumns(
  table: string,
  filter: string,
  opts: {
    select: string
    order?: string
    pageSize?: number
    maxRows?: number
  },
  logLabel: string
): Promise<unknown[]> {
  const cols = opts.select
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let use = [...cols]
  for (let i = 0; i < 40; i++) {
    try {
      return (await supabaseSelectFilterAllPages(table, filter, {
        order: opts.order,
        select: use.join(','),
        pageSize: opts.pageSize,
        maxRows: opts.maxRows,
      })) as unknown[]
    } catch (e) {
      const missingCol = extractAnyMissingColumn(e)
      if (!missingCol) throw e
      const next = use.filter((c) => c !== missingCol)
      if (next.length === use.length) throw e
      use = next
      console.warn(`${logLabel}: select omit missing column '${missingCol}'`)
    }
  }
  throw new Error(`${logLabel}: too many select column retries`)
}
