import { getPosTaxInvoiceRecipients, type PosTaxInvoiceRecipientRow } from '@/lib/api-client'
import {
  isSyntheticTaxRegistryKey,
  rowToTaxProfile,
  taxRegistryLocalKey,
  type TaxInvoiceProfile,
  type TaxSearchField,
} from '@/lib/cart-panel-tax-invoice-utils'

export type TaxProfileSearchResult =
  | { ok: true; messageKey: 'posTaxSearchLoadedServer' | 'posTaxSearchLoaded'; displayNo?: string; profile: TaxInvoiceProfile; registryKey: string; memberNo: string }
  | { ok: false; messageKey: 'posTaxSearchNeedKeyword' | 'posTaxSearchNoSavedProfile' }

export async function searchCartPanelTaxInvoiceProfile(params: {
  keyword: string
  taxSearchField: TaxSearchField
  taxMemberRegistry: Record<string, TaxInvoiceProfile>
  authStore?: string
  authRole?: string
  currentStoreId?: string
}): Promise<TaxProfileSearchResult> {
  const keyword = params.keyword.trim()
  if (!keyword) return { ok: false, messageKey: 'posTaxSearchNeedKeyword' }

  const byApi: 'phone' | 'taxId' | 'name' | 'memberNo' =
    params.taxSearchField === 'memberNo'
      ? 'memberNo'
      : params.taxSearchField === 'taxId'
        ? 'taxId'
        : params.taxSearchField === 'name'
          ? 'name'
          : 'phone'
  const qForApi =
    params.taxSearchField === 'taxId' || params.taxSearchField === 'phone'
      ? keyword.replace(/\D/g, '')
      : keyword

  if (params.authStore && params.authRole && params.currentStoreId && qForApi.length > 0) {
    try {
      const res = await getPosTaxInvoiceRecipients({
        userStore: params.authStore,
        userRole: params.authRole,
        storeCode: params.currentStoreId,
        q: qForApi,
        by: byApi,
        limit: 20,
      })
      if (res.success && res.rows?.length) {
        const usable = res.rows.filter((r) => r.is_active)
        const pick = (usable.length ? usable : res.rows)[0]
        const profile = rowToTaxProfile(pick)
        const registryKey = taxRegistryLocalKey(
          pick.member_no?.trim() || '',
          undefined,
          pick.tax_id,
          pick.branch_no
        )
        return {
          ok: true,
          messageKey: 'posTaxSearchLoadedServer',
          profile,
          registryKey,
          memberNo: pick.member_no?.trim() || '',
        }
      }
    } catch (e) {
      console.error('getPosTaxInvoiceRecipients:', e)
    }
  }

  const entries = Object.entries(params.taxMemberRegistry)
  let found: [string, TaxInvoiceProfile] | undefined
  if (params.taxSearchField === 'memberNo') {
    found = entries.find(([memberNo]) => memberNo === keyword)
  } else if (params.taxSearchField === 'phone') {
    const k = keyword.replace(/\D/g, '')
    found = entries.find(([, profile]) => String(profile.phone || '').replace(/\D/g, '').includes(k))
  } else if (params.taxSearchField === 'taxId') {
    const k = keyword.replace(/\D/g, '')
    found = entries.find(([, profile]) => {
      const tid = String(profile.taxId || '').replace(/\D/g, '')
      return tid === k || (k.length >= 5 && tid.includes(k))
    })
  } else {
    const k = keyword.toLowerCase()
    found = entries.find(([, profile]) => String(profile.name || '').toLowerCase().includes(k))
  }

  if (!found) return { ok: false, messageKey: 'posTaxSearchNoSavedProfile' }

  const displayNo = isSyntheticTaxRegistryKey(found[0]) ? found[1].taxId || found[0] : found[0]
  return {
    ok: true,
    messageKey: 'posTaxSearchLoaded',
    displayNo,
    profile: found[1],
    registryKey: found[0],
    memberNo: isSyntheticTaxRegistryKey(found[0]) ? '' : found[0],
  }
}

export function applyTaxProfileFromServerRow(row: PosTaxInvoiceRecipientRow): {
  profile: TaxInvoiceProfile
  registryKey: string
  memberNo: string
} {
  const profile = rowToTaxProfile(row)
  const registryKey = taxRegistryLocalKey(row.member_no?.trim() || '', undefined, row.tax_id, row.branch_no)
  return { profile, registryKey, memberNo: row.member_no?.trim() || '' }
}
