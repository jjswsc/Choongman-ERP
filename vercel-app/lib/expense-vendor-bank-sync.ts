import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

export type VendorBankRow = {
  code?: string
  name?: string | null
  bank_name?: string | null
  bank_account_no?: string | null
}

/** payee_code 에서 ::wm:: 카테고리 접미사 제거 */
export function decodeExpensePayeeMasterCode(raw: string | undefined | null): string {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return src
  return src.slice(0, idx).trim()
}

/** 거래처 마스터 코드인지 (auto_/card_ 제외) */
export function isMasterVendorPayeeCode(code: string): boolean {
  const c = String(code || '').trim()
  if (!c || c.startsWith('auto_')) return false
  if (/^card_\d+$/i.test(c)) return false
  return true
}

export async function loadVendorBankByCode(codeRaw: string): Promise<VendorBankRow | null> {
  const code = decodeExpensePayeeMasterCode(codeRaw)
  if (!isMasterVendorPayeeCode(code)) return null
  try {
    const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
      select: 'code,name,bank_name,bank_account_no',
      limit: 1,
    })) as VendorBankRow[] | null
    return rows?.[0] || null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/bank_account_no|bank_name|column/i.test(msg)) {
      try {
        const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
          select: 'code,name',
          limit: 1,
        })) as VendorBankRow[] | null
        return rows?.[0] || null
      } catch {
        return null
      }
    }
    console.warn('loadVendorBankByCode:', e)
    return null
  }
}

/**
 * 지출 이체 계좌를 거래처 마스터에 반영.
 * 은행·계좌가 있을 때만 갱신(빈 값으로 마스터를 지우지 않음).
 */
export async function syncVendorBankFromExpense(params: {
  payeeCode: string
  bankName?: string
  bankAccountNo?: string
}): Promise<{ synced: boolean; warning: string | null }> {
  const code = decodeExpensePayeeMasterCode(params.payeeCode)
  if (!isMasterVendorPayeeCode(code)) return { synced: false, warning: null }
  const bankName = String(params.bankName || '').trim()
  const bankAccountNo = String(params.bankAccountNo || '').trim()
  if (!bankName && !bankAccountNo) return { synced: false, warning: null }

  const vendorPatch: Record<string, unknown> = {}
  if (bankAccountNo) vendorPatch.bank_account_no = bankAccountNo
  if (bankName) vendorPatch.bank_name = bankName
  try {
    await supabaseUpdateByFilter('vendors', `code=eq.${encodeURIComponent(code)}`, vendorPatch)
    return { synced: true, warning: null }
  } catch (vendorErr) {
    console.warn('syncVendorBankFromExpense:', vendorErr)
    return {
      synced: false,
      warning:
        '지급 정보에는 반영됐지만 거래처 마스터 계좌 동기화에 실패했습니다. 거래처 관리에서 확인해 주세요.',
    }
  }
}
