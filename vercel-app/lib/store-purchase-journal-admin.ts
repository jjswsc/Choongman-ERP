import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
} from '@/lib/accounting-posting'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export type StorePurchaseJournalLine = {
  accountCode: string
  accountName: string
  side: string
  amount: number
}

export type StorePurchaseJournalEntry = {
  id: number
  entryNo: string
  accountingDate: string
  storeName: string | null
  memo: string | null
  lines: StorePurchaseJournalLine[]
}

export async function loadStorePurchaseJournals(orderId: number): Promise<StorePurchaseJournalEntry[]> {
  const oid = Math.floor(Number(orderId) || 0)
  if (oid <= 0) return []

  const entries = (await supabaseSelectFilter(
    'journal_entries',
    `source_type=eq.store_purchase&source_id=eq.${oid}`,
    {
      select: 'id,entry_no,accounting_date,store_name,memo',
      limit: 50,
      order: 'id.asc',
    }
  )) as {
    id?: number
    entry_no?: string
    accounting_date?: string
    store_name?: string | null
    memo?: string | null
  }[] | null

  const out: StorePurchaseJournalEntry[] = []
  for (const entry of entries || []) {
    const entryId = Number(entry.id || 0)
    if (!entryId) continue
    const lines = (await supabaseSelectFilter(
      'journal_lines',
      `journal_entry_id=eq.${entryId}`,
      {
        select: 'account_code,account_name,side,amount',
        limit: 50,
        order: 'id.asc',
      }
    )) as {
      account_code?: string
      account_name?: string
      side?: string
      amount?: number
    }[] | null

    out.push({
      id: entryId,
      entryNo: String(entry.entry_no || '').trim() || `JE#${entryId}`,
      accountingDate: String(entry.accounting_date || '').slice(0, 10),
      storeName: entry.store_name != null ? String(entry.store_name).trim() || null : null,
      memo: entry.memo != null ? String(entry.memo).trim() || null : null,
      lines: (lines || []).map((line) => ({
        accountCode: String(line.account_code || '').trim(),
        accountName: String(line.account_name || '').trim(),
        side: String(line.side || '').trim(),
        amount: Math.abs(Number(line.amount) || 0),
      })),
    })
  }
  return out
}

export async function removeStorePurchaseJournals(orderId: number): Promise<number> {
  const oid = Math.floor(Number(orderId) || 0)
  if (oid <= 0) return 0

  const entries = await loadStorePurchaseJournals(oid)
  if (!entries.length) return 0

  for (const entry of entries) {
    await assertAccountingDateOpen(entry.accountingDate, entry.storeName)
  }

  return deleteJournalEntriesBySource('store_purchase', oid)
}
