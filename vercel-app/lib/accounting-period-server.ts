import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function isAccountingPeriodClosed(yearMonth: string): Promise<boolean> {
  const ym = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return false
  try {
    const rows = (await supabaseSelectFilter(
      'accounting_periods',
      `year_month=eq.${encodeURIComponent(ym)}`,
      { select: 'is_closed', limit: 1 }
    )) as { is_closed?: boolean }[] | null
    return Boolean(rows?.[0]?.is_closed)
  } catch {
    return false
  }
}
