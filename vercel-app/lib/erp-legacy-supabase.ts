import { isSaasBrand } from '@/lib/app-brand'

/** 충만 ERP Supabase project ref (faxolqgaadcvyeyvrydc) */
export const CHOONGMAN_SUPABASE_PROJECT_REF = 'faxolqgaadcvyeyvrydc'

/** Omni SaaS Supabase project ref */
export const OMNI_SUPABASE_PROJECT_REF = 'zivwuwwffeqjshcprxlz'

function supabaseUrlLower(): string {
  return String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .trim()
    .toLowerCase()
}

/**
 * erp_stores.tenant_id 등 SaaS 전용 스키마가 없는 충만 레거시 DB.
 * - project ref 우선
 * - URL에 ref 없으면 env 브랜드(choongman 기본)로 판단 — cron·웹훅( Host 없음) 포함
 */
export function isLegacyChoongmanErpSupabase(): boolean {
  if (String(process.env.CM_ERP_LEGACY_DB || '').trim() === '1') return true
  const url = supabaseUrlLower()
  if (url.includes(CHOONGMAN_SUPABASE_PROJECT_REF)) return true
  if (url.includes(OMNI_SUPABASE_PROJECT_REF)) return false
  return !isSaasBrand()
}
