import { supabaseSelectFilter } from '@/lib/supabase-server'

/** marketing_campaigns.id → campaign_no (없으면 빈 문자열) */
export async function campaignNoByIdMap(
  ids: Array<number | string | null | undefined>
): Promise<Map<number, string>> {
  const nums = [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ]
  const out = new Map<number, string>()
  if (nums.length === 0) return out

  const filter = `id=in.(${nums.map((n) => encodeURIComponent(String(n))).join(',')})`
  const rows = (await supabaseSelectFilter('marketing_campaigns', filter, {
    limit: 500,
    select: 'id,campaign_no',
  })) as { id?: number; campaign_no?: string }[] | null

  for (const r of rows || []) {
    if (r.id == null) continue
    out.set(Number(r.id), String(r.campaign_no ?? '').trim())
  }
  return out
}
