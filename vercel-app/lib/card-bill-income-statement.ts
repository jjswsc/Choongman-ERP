import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import { isCardBillAllocationPlLine } from '@/lib/card-bill-allocation'
import { isHeadOfficeLikeStoreName } from '@/lib/internal-outbound'
import { isOfficeStore } from '@/lib/permissions'
import { supabaseSelect, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

function isHqCardStore(store: string): boolean {
  const s = String(store || '').trim()
  if (!s) return false
  return isOfficeStore(s) || isHeadOfficeLikeStoreName(s) || s.startsWith('Office-')
}

const CARD_BILL_PL_MAX_ROWS = 1_000_000

export type CardBillPlLine = {
  id: number
  transDate: string
  amount: number
  vatAmount: number
  accountSubjectId: number | null
  vendorCode: string | null
  memo: string | null
  store: string | null
}

export async function loadCardBillAllocationLinesForPl(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<{
  lines: CardBillPlLine[]
  linkedBankTransactionIds: Set<number>
  fetched: number
}> {
  const empty = {
    lines: [] as CardBillPlLine[],
    linkedBankTransactionIds: new Set<number>(),
    fetched: 0,
  }
  try {
    const [childRows, headerRows, accountRows] = await Promise.all([
      supabaseSelectFilterAllPages(
        'card_transactions',
        `trans_type=eq.expense&trans_date=gte.${params.startStr}&trans_date=lte.${params.endStr}&parent_id=not.is.null`,
        {
          select: 'id,trans_date,amount,vat_amount,account_subject_id,memo,vendor_code,card_account_id,parent_id,is_bill_header,trans_type',
          order: 'id.asc',
          pageSize: 4000,
          maxRows: CARD_BILL_PL_MAX_ROWS,
        }
      ) as Promise<
        {
          id?: number
          trans_date?: string
          amount?: number
          vat_amount?: number | null
          account_subject_id?: number | null
          memo?: string | null
          vendor_code?: string | null
          card_account_id?: number | null
          parent_id?: number | null
          is_bill_header?: boolean | null
          trans_type?: string | null
        }[]
      >,
      supabaseSelectFilterAllPages('card_transactions', 'bank_transaction_id=not.is.null', {
        select: 'bank_transaction_id',
        pageSize: 8000,
        maxRows: CARD_BILL_PL_MAX_ROWS,
      }) as Promise<{ bank_transaction_id?: number }[]>,
      supabaseSelect('card_accounts', { select: 'id,store', limit: 2000 }) as Promise<
        { id?: number; store?: string | null }[] | null
      >,
    ])

    const storeByAccountId = new Map<number, string>()
    for (const a of accountRows || []) {
      const id = Number(a.id || 0)
      if (id > 0) storeByAccountId.set(id, String(a.store || '').trim())
    }

    const linkedBankTransactionIds = new Set<number>()
    for (const r of headerRows || []) {
      const bid = Number(r.bank_transaction_id || 0)
      if (bid > 0) linkedBankTransactionIds.add(bid)
    }

    const lines: CardBillPlLine[] = []
    for (const r of childRows || []) {
      if (
        !isCardBillAllocationPlLine({
          transType: r.trans_type,
          parentId: r.parent_id,
          isBillHeader: r.is_bill_header,
        })
      ) {
        continue
      }
      const store = storeByAccountId.get(Number(r.card_account_id || 0)) || ''
      if (params.isHQ) {
        if (!isHqCardStore(store)) continue
      } else if (params.storeFilter !== 'All') {
        if (!storeMatchesIncomeFilter(store, params.storeFilter)) continue
      }
      const id = Number(r.id || 0)
      if (!id) continue
      lines.push({
        id,
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount) || 0),
        vatAmount: Math.max(0, Number(r.vat_amount) || 0),
        accountSubjectId:
          r.account_subject_id != null && Number(r.account_subject_id) > 0
            ? Number(r.account_subject_id)
            : null,
        vendorCode: r.vendor_code ? String(r.vendor_code).trim() : null,
        memo: r.memo ? String(r.memo).trim() : null,
        store: store || null,
      })
    }

    return { lines, linkedBankTransactionIds, fetched: childRows?.length || 0 }
  } catch (e) {
    console.warn('loadCardBillAllocationLinesForPl:', e)
    return empty
  }
}
