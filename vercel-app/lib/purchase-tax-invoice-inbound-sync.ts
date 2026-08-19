import 'server-only'

import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
} from '@/lib/supabase-server'
import {
  buildItemTaxMapFromRows,
  computeInboundBatchTaxableAmounts,
  formatStockLogDateBangkokYmd,
  type InboundPayableLine,
} from '@/lib/inbound-payable-amount'
import { roundMoney2 } from '@/lib/invoice-vat-total'
import { digitsTin13, isTin13, SELLER_BRANCH_HQ } from '@/lib/purchase-tax-invoice-core'
import {
  deletePurchaseTaxInvoiceByInboundBatch,
  PurchaseTaxInvoiceDuplicateError,
  PurchaseTaxInvoiceSubmittedError,
  resolveBuyerTaxIdForStore,
  upsertPurchaseTaxInvoice,
} from '@/lib/purchase-tax-invoice-server'

type BatchRow = {
  id?: number
  location?: string | null
  vendor_name?: string | null
  vendor_code?: string | null
  batch_date?: string | null
  total_amount?: number | null
  invoice_received?: boolean | null
  invoice_no?: string | null
  invoice_photo_url?: string | null
}

type StockLogRow = {
  item_code?: string
  qty?: number
  unit_cost?: number | null
  log_date?: string
}

async function lookupVendorTaxProfile(vendorCode: string, vendorName: string): Promise<{
  taxId: string
  name: string
}> {
  const code = String(vendorCode || '').trim()
  const fallbackName = String(vendorName || code || '').trim()
  if (code) {
    try {
      const rows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(code)}`, {
        limit: 1,
        select: 'tax_id,name,gps_name',
      })) as { tax_id?: string | null; name?: string | null; gps_name?: string | null }[] | null
      const row = rows?.[0]
      if (row) {
        return {
          taxId: digitsTin13(row.tax_id),
          name: String(row.name || row.gps_name || fallbackName).trim() || fallbackName,
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (fallbackName) {
    try {
      const rows = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent(fallbackName)}`, {
        limit: 1,
        select: 'tax_id,name,gps_name',
      })) as { tax_id?: string | null; name?: string | null; gps_name?: string | null }[] | null
      const row = rows?.[0]
      if (row) {
        return {
          taxId: digitsTin13(row.tax_id),
          name: String(row.name || row.gps_name || fallbackName).trim() || fallbackName,
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { taxId: '', name: fallbackName }
}

function splitGrossPreferBatchTotal(
  taxableNet: number,
  vatTotal: number,
  taxableGross: number,
  exemptNet: number,
  batchTotal: number
): { net: number; vat: number; gross: number } {
  if (exemptNet <= 0) {
    const gross = roundMoney2(Number(batchTotal) || taxableGross)
    if (gross > 0) {
      const vat = roundMoney2((gross * 7) / 107)
      const net = roundMoney2(gross - vat)
      if (net > 0 || vat > 0) return { net, vat, gross }
    }
  }
  return { net: taxableNet, vat: vatTotal, gross: taxableGross }
}

export async function syncPurchaseTaxInvoiceFromInboundBatch(
  batchId: number,
  opts?: { actor?: string }
): Promise<'upserted' | 'deleted' | 'skipped'> {
  const id = Math.floor(Number(batchId) || 0)
  if (id <= 0) return 'skipped'
  const actor = String(opts?.actor || 'system').trim() || 'system'

  const batches = (await supabaseSelectFilter('inbound_batches', `id=eq.${id}`, {
    limit: 1,
    select:
      'id,location,vendor_name,vendor_code,batch_date,total_amount,invoice_received,invoice_no,invoice_photo_url',
  })) as BatchRow[] | null
  const batch = batches?.[0]
  if (!batch?.id) {
    await deletePurchaseTaxInvoiceByInboundBatch(id)
    return 'deleted'
  }

  const invoiceNo = String(batch.invoice_no || '').trim()
  const invoiceReceived = Boolean(batch.invoice_received)
  if (!invoiceReceived || !invoiceNo) {
    await deletePurchaseTaxInvoiceByInboundBatch(id)
    return 'deleted'
  }

  const logs = (await supabaseSelectFilter('stock_logs', `inbound_batch_id=eq.${id}`, {
    limit: 8000,
    select: 'item_code,qty,unit_cost,log_date',
  })) as StockLogRow[] | null
  const lines: InboundPayableLine[] = []
  for (const row of logs || []) {
    const code = String(row.item_code || '').trim()
    const qty = Number(row.qty) || 0
    if (!code || qty <= 0) continue
    const unitCost = row.unit_cost != null && !Number.isNaN(Number(row.unit_cost)) ? Number(row.unit_cost) : 0
    lines.push({
      code,
      qty,
      unitCost,
      dateYmd: formatStockLogDateBangkokYmd(row.log_date),
    })
  }
  if (!lines.length) {
    await deletePurchaseTaxInvoiceByInboundBatch(id)
    return 'deleted'
  }

  const itemRows = (await supabaseSelect('items', {
    limit: 12000,
    select: 'code,tax',
  })) as { code?: string; tax?: string | null }[] | null
  const taxByCode = buildItemTaxMapFromRows(itemRows)
  const amounts = computeInboundBatchTaxableAmounts(lines, taxByCode)
  const split = splitGrossPreferBatchTotal(
    amounts.taxableNet,
    amounts.vatTotal,
    amounts.taxableGross,
    amounts.exemptNet,
    Number(batch.total_amount) || 0
  )
  if (split.net <= 0 && split.vat <= 0) {
    await deletePurchaseTaxInvoiceByInboundBatch(id)
    return 'deleted'
  }

  const vendor = await lookupVendorTaxProfile(String(batch.vendor_code || ''), String(batch.vendor_name || ''))
  if (!isTin13(vendor.taxId)) {
    await deletePurchaseTaxInvoiceByInboundBatch(id)
    return 'skipped'
  }

  const storeName = String(batch.location || '').trim()
  if (!storeName) return 'skipped'
  const buyerTaxId = await resolveBuyerTaxIdForStore(storeName)
  if (!isTin13(buyerTaxId)) return 'skipped'

  const docDate = String(batch.batch_date || amounts.batchDateYmd || '').slice(0, 10)
  const photo = String(batch.invoice_photo_url || '').trim()

  try {
    await upsertPurchaseTaxInvoice(
      {
        storeName,
        buyerTaxId,
        docDate,
        invoiceNo,
        sellerName: vendor.name || String(batch.vendor_name || invoiceNo).trim(),
        sellerTaxId: vendor.taxId,
        sellerBranch: SELLER_BRANCH_HQ,
        netAmount: split.net,
        vatAmount: split.vat,
        totalAmount: split.gross,
        source: 'inbound_batch',
        inboundBatchId: id,
        attachmentUrls: photo ? [photo] : [],
      },
      { actor, allowOverwriteManual: false }
    )
    return 'upserted'
  } catch (e) {
    if (e instanceof PurchaseTaxInvoiceDuplicateError) return 'skipped'
    if (e instanceof PurchaseTaxInvoiceSubmittedError) return 'skipped'
    throw e
  }
}

export async function syncInboundBatchPurchaseTaxInvoicesForMonths(params: {
  months: string[]
  storeFilter?: string
}): Promise<{ upserted: number; deleted: number; skipped: number }> {
  const validMonths = (params.months || [])
    .map((m) => String(m || '').slice(0, 7))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!validMonths.length) return { upserted: 0, deleted: 0, skipped: 0 }

  const start = `${validMonths[0]}-01`
  const last = validMonths[validMonths.length - 1]!
  const y = Number(last.slice(0, 4))
  const mo = Number(last.slice(5, 7))
  const endDate = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)

  let batches: BatchRow[] = []
  try {
    batches = (await supabaseSelectFilterAllPages(
      'inbound_batches',
      [`batch_date=gte.${encodeURIComponent(start)}`, `batch_date=lte.${encodeURIComponent(endDate)}`].join('&'),
      {
        select: 'id,location,invoice_received,invoice_no',
        order: 'id.asc',
        pageSize: 2000,
        maxRows: 30000,
      }
    )) as BatchRow[]
  } catch {
    return { upserted: 0, deleted: 0, skipped: 0 }
  }

  const storeFilter = String(params.storeFilter || '').trim()
  let upserted = 0
  let deleted = 0
  let skipped = 0
  for (const b of batches || []) {
    const id = Math.floor(Number(b.id) || 0)
    if (id <= 0) continue
    if (storeFilter && storeFilter !== 'All') {
      const loc = String(b.location || '').trim()
      if (loc && !loc.toLowerCase().includes(storeFilter.toLowerCase()) && storeFilter.toLowerCase() !== loc.toLowerCase()) {
        /* still sync by id — store filter is approximate; full filter happens at list */
      }
    }
    try {
      const r = await syncPurchaseTaxInvoiceFromInboundBatch(id)
      if (r === 'upserted') upserted += 1
      else if (r === 'deleted') deleted += 1
      else skipped += 1
    } catch (e) {
      console.warn('syncInboundBatchPurchaseTaxInvoicesForMonths batch', id, e)
      skipped += 1
    }
  }
  return { upserted, deleted, skipped }
}
