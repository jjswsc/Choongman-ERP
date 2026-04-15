/**
 * 고정자산·감가상각 서버 로직
 */
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { postDepreciationJournal } from '@/lib/accounting-posting'

export type FixedAsset = {
  id: number
  asset_code: string
  name: string
  store_name: string
  acquisition_date: string
  acquisition_cost: number
  residual_rate: number
  useful_life_months: number
  depreciation_method: string
  status: string
  disposed_at?: string | null
  memo?: string | null
}

/** 정액법 월 상각액 */
function straightLineMonthly(
  acquisitionCost: number,
  residualRate: number,
  usefulLifeMonths: number
): number {
  const depreciable = acquisitionCost * (1 - residualRate / 100)
  return usefulLifeMonths > 0 ? Math.round((depreciable / usefulLifeMonths) * 100) / 100 : 0
}

/** 해당 월에 상각 가능한 자산 목록 + 이미 상각된 월 제외 */
export async function getDepreciableAssetsForMonth(yearMonth: string): Promise<
  (FixedAsset & { monthly_amount: number; already_posted: boolean })[]
> {
  const [y, m] = yearMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const lastDayStr = `${yearMonth}-${String(lastDay).padStart(2, '0')}`

  const assets = (await supabaseSelectFilter(
    'fixed_assets',
    `status=eq.active&acquisition_date=lte.${lastDayStr}`,
    { select: '*', limit: 500 }
  )) as (FixedAsset & { acquisition_date?: string })[]

  const existing = (await supabaseSelectFilter(
    'depreciation_entries',
    `year_month=eq.${yearMonth}`,
    { select: 'fixed_asset_id', limit: 500 }
  )) as { fixed_asset_id?: number }[] | null
  const postedIds = new Set((existing || []).map((r) => r.fixed_asset_id).filter(Boolean))

  const result: (FixedAsset & { monthly_amount: number; already_posted: boolean })[] = []
  for (const a of assets || []) {
    const acqDate = String(a.acquisition_date || '').slice(0, 10)
    const acqY = Number(acqDate.slice(0, 4))
    const acqM = Number(acqDate.slice(5, 7))
    const monthsFromAcq =
      acqY < y ? (y - acqY) * 12 + (m - acqM) : acqY === y ? m - acqM : 0
    if (monthsFromAcq < 0) continue
    if (monthsFromAcq >= (a.useful_life_months || 60)) continue

    const monthly =
      a.depreciation_method === 'declining_balance'
        ? straightLineMonthly(
            a.acquisition_cost,
            a.residual_rate,
            a.useful_life_months
          )
        : straightLineMonthly(
            a.acquisition_cost,
            a.residual_rate,
            a.useful_life_months
          )
    if (monthly <= 0) continue

    result.push({
      ...a,
      monthly_amount: monthly,
      already_posted: postedIds.has(a.id),
    })
  }
  return result
}

/** 해당 월 감가상각 실행 (분개까지) */
export async function runDepreciationForMonth(params: {
  yearMonth: string
  storeFilter?: string
  dryRun?: boolean
}): Promise<{ created: number; totalAmount: number }> {
  const { yearMonth, storeFilter, dryRun } = params
  const [y, m] = yearMonth.split('-').map(Number)
  const accountingDate = `${yearMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`

  const candidates = await getDepreciableAssetsForMonth(yearMonth)
  let created = 0
  let totalAmount = 0

  for (const asset of candidates) {
    if (asset.already_posted) continue
    if (storeFilter && storeFilter !== 'All' && asset.store_name !== storeFilter) continue

    const amount = asset.monthly_amount
    if (amount <= 0) continue
    totalAmount += amount

    if (!dryRun) {
      const entryRow = {
        fixed_asset_id: asset.id,
        year_month: yearMonth,
        accounting_date: accountingDate,
        amount,
      }
      const inserted = (await supabaseInsert('depreciation_entries', entryRow)) as {
        id?: number
      }[]
      const entryId = inserted?.[0]?.id

      const jeId = await postDepreciationJournal({
        depreciationEntryId: entryId ?? undefined,
        accountingDate,
        amount,
        assetName: asset.name,
        storeName: asset.store_name,
        memo: `감가상각 ${asset.name} (${yearMonth})`,
      })
      if (entryId && jeId) {
        await supabaseUpdate('depreciation_entries', entryId, { journal_entry_id: jeId })
      }
      created++
    } else {
      created++
    }
  }
  return { created, totalAmount }
}
