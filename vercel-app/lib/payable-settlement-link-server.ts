import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import {
  type PayableSettlementLinkRow,
  validatePayableSettlementLinkRequest,
  payableLinkComponentIds,
  type PayableLedgerRowLike,
} from '@/lib/payable-settlement-link'

export async function loadPayableSettlementLinksForTransactionIds(
  ids: number[]
): Promise<PayableSettlementLinkRow[]> {
  const unique = [...new Set(ids.filter((id) => id > 0))]
  if (unique.length === 0) return []
  try {
    const chunkSize = 200
    const byKey = new Map<string, PayableSettlementLinkRow>()
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize)
      const filter = `or=(payment_id.in.(${chunk.join(',')}),accrual_id.in.(${chunk.join(',')}))`
      const rows = (await supabaseSelectFilter('payable_settlement_links', filter, {
        select: 'id,payment_id,accrual_id',
        limit: 10000,
      })) as PayableSettlementLinkRow[] | null
      for (const row of rows || []) {
        const paymentId = Number(row.payment_id || 0)
        const accrualId = Number(row.accrual_id || 0)
        if (!paymentId || !accrualId) continue
        const key = `${paymentId}:${accrualId}`
        byKey.set(key, { id: row.id, payment_id: paymentId, accrual_id: accrualId })
      }
    }
    return [...byKey.values()]
  } catch {
    return []
  }
}

async function loadPayableRowsByIds(ids: number[]): Promise<PayableLedgerRowLike[]> {
  const unique = [...new Set(ids.filter((id) => id > 0))]
  if (unique.length === 0) return []
  const rows = (await supabaseSelectFilter('payable_transactions', `id=in.(${unique.join(',')})`, {
    select: 'id,vendor_code,amount,ref_type,trans_date,memo',
    limit: unique.length,
  })) as PayableLedgerRowLike[] | null
  return rows || []
}

export async function linkPayableSettlementTransactions(params: {
  vendorCode: string
  accrualIds: number[]
  paymentIds: number[]
}): Promise<{ success: boolean; message: string; linkCount?: number }> {
  const vendorCode = String(params.vendorCode || '').trim()
  const accrualIds = [...new Set((params.accrualIds || []).map((id) => Number(id)).filter((id) => id > 0))]
  const paymentIds = [...new Set((params.paymentIds || []).map((id) => Number(id)).filter((id) => id > 0))]
  if (!vendorCode) return { success: false, message: '매입처가 필요합니다.' }
  if (accrualIds.length === 0 || paymentIds.length === 0) {
    return { success: false, message: '연결할 매입·지급 내역을 선택해 주세요.' }
  }

  const allIds = [...accrualIds, ...paymentIds]
  const rows = await loadPayableRowsByIds(allIds)
  const byId = new Map(rows.map((r) => [Number(r.id), r]))
  const accrualRows = accrualIds.map((id) => byId.get(id)).filter(Boolean) as PayableLedgerRowLike[]
  const paymentRows = paymentIds.map((id) => byId.get(id)).filter(Boolean) as PayableLedgerRowLike[]
  if (accrualRows.length !== accrualIds.length || paymentRows.length !== paymentIds.length) {
    return { success: false, message: '선택한 내역 중 일부를 찾을 수 없습니다.' }
  }

  const existingLinks = await loadPayableSettlementLinksForTransactionIds(allIds)
  const validation = validatePayableSettlementLinkRequest({
    vendorCode,
    accrualRows,
    paymentRows,
    existingLinks,
  })
  if (!validation.ok) return { success: false, message: validation.message }

  let inserted = 0
  for (const link of validation.links) {
    await supabaseInsert('payable_settlement_links', {
      payment_id: link.paymentId,
      accrual_id: link.accrualId,
    })
    inserted += 1
  }
  return {
    success: true,
    message: `매입·지급 ${inserted}건 연결이 저장되었습니다.`,
    linkCount: inserted,
  }
}

export async function unlinkPayableSettlementTransaction(
  transactionId: number
): Promise<{ success: boolean; message: string; removed?: number }> {
  const id = Number(transactionId || 0)
  if (!id) return { success: false, message: '유효한 id가 필요합니다.' }

  const existing = await loadPayableSettlementLinksForTransactionIds([id])
  if (existing.length === 0) {
    return { success: false, message: '연결된 내역이 없습니다.' }
  }

  const component = payableLinkComponentIds(id, existing)
  const linkIdsToDelete = existing
    .filter((link) => component.has(link.payment_id) || component.has(link.accrual_id))
    .map((link) => Number(link.id || 0))
    .filter((linkId) => linkId > 0)

  let removed = 0
  if (linkIdsToDelete.length > 0) {
    await supabaseDeleteByFilter('payable_settlement_links', `id=in.(${linkIdsToDelete.join(',')})`)
    removed = linkIdsToDelete.length
  } else {
    await supabaseDeleteByFilter(
      'payable_settlement_links',
      `or=(payment_id.eq.${id},accrual_id.eq.${id})`
    )
    removed = existing.length
  }

  return {
    success: true,
    message: '매입·지급 연결이 해제되었습니다.',
    removed,
  }
}
