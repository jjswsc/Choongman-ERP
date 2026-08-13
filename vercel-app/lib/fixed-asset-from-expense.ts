import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

/** 고정자산 취득 분개·선택 기본값: 기타유형자산 → 없으면 재고자산(기존 매핑) */
export const DEFAULT_FIXED_ASSET_ACCOUNT_CODES = ['1490', '1460'] as const

export type AccountSubjectRef = {
  id: number
  code: string
  name: string
}

export async function resolveAccountSubjectByCodes(codes: readonly string[]): Promise<AccountSubjectRef | null> {
  for (const raw of codes) {
    const code = String(raw || '').trim()
    if (!code) continue
    const rows = (await supabaseSelectFilter('account_subjects', `code=eq.${encodeURIComponent(code)}`, {
      select: 'id,code,name',
      limit: 1,
    })) as { id?: number; code?: string; name?: string }[] | null
    const first = rows?.[0]
    const id = Number(first?.id || 0)
    if (id > 0) {
      return {
        id,
        code: String(first?.code || code).trim() || code,
        name: String(first?.name || code).trim() || code,
      }
    }
  }
  return null
}

function isMissingAccountColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('42703') ||
    msg.includes('asset_account_code') ||
    msg.includes('accumulated_depreciation_account_code') ||
    msg.includes('depreciation_expense_account_code')
  )
}

export async function insertFixedAssetFromExpense(params: {
  assetCode?: string
  name: string
  storeName: string
  acquisitionDate: string
  acquisitionCost: number
  residualRate?: number
  usefulLifeMonths?: number
  memo?: string | null
  assetAccountCode?: string | null
}): Promise<number | null> {
  const code = String(params.assetCode || '').trim() || `FA-${Date.now()}`
  const name = String(params.name || '').trim() || '고정자산'
  const storeName = String(params.storeName || '').trim() || 'All'
  const acquisitionDate = String(params.acquisitionDate || '').slice(0, 10)
  const acquisitionCost = Math.max(0, Number(params.acquisitionCost) || 0)
  const residualRate = Math.min(100, Math.max(0, Number(params.residualRate) || 0))
  const usefulLifeMonths = Math.max(1, Number(params.usefulLifeMonths) || 60)
  const memo = String(params.memo || '').trim() || null
  const assetAccountCode = String(params.assetAccountCode || '').trim() || '1490'

  const row: Record<string, unknown> = {
    asset_code: code,
    name,
    store_name: storeName,
    acquisition_date: acquisitionDate,
    acquisition_cost: acquisitionCost,
    residual_rate: residualRate,
    useful_life_months: usefulLifeMonths,
    depreciation_method: 'straight_line',
    status: 'active',
    memo,
    asset_account_code: assetAccountCode,
    accumulated_depreciation_account_code: '1470',
    depreciation_expense_account_code: '5500',
  }

  try {
    const inserted = (await supabaseInsert('fixed_assets', row)) as { id?: number }[]
    return Number(inserted?.[0]?.id || 0) || null
  } catch (e) {
    if (!isMissingAccountColumnError(e)) throw e
    const fallback = { ...row }
    delete fallback.asset_account_code
    delete fallback.accumulated_depreciation_account_code
    delete fallback.depreciation_expense_account_code
    const inserted = (await supabaseInsert('fixed_assets', fallback)) as { id?: number }[]
    return Number(inserted?.[0]?.id || 0) || null
  }
}
