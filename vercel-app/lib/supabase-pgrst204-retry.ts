import { supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** PostgREST PGRST204: Could not find the 'col' column */
export function extractPgrstMissingColumn(error: unknown): string | null {
  const msg = String(error ?? '')
  const m = msg.match(/Could not find the '([^']+)' column/i)
  return m?.[1] || null
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
      const missingCol = extractPgrstMissingColumn(e)
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
      const missingCol = extractPgrstMissingColumn(e)
      if (!missingCol || !(missingCol in working)) throw e
      delete working[missingCol]
      console.warn(`${logLabel}: skip missing column '${missingCol}'`)
    }
  }
  throw new Error(`${logLabel}: too many missing-column retries`)
}
