import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  assertCanManageAccountingCompliance,
  assertCanWriteAccountingCompliance,
} from '@/lib/accounting-auth'
import { writeAccountingComplianceAudit } from '@/lib/accounting-compliance-audit'
import {
  deletePurchaseTaxInvoice,
  deletePurchaseTaxInvoices,
  listPurchaseTaxInvoices,
  PurchaseTaxInvoiceDuplicateError,
  PurchaseTaxInvoiceSubmittedError,
  resolveBuyerTaxIdForStore,
  upsertPurchaseTaxInvoice,
} from '@/lib/purchase-tax-invoice-server'
import { syncInboundBatchPurchaseTaxInvoicesForMonths } from '@/lib/purchase-tax-invoice-inbound-sync'
import {
  digitsTin13,
  formatSellerBranch,
  isTin13,
  normalizePurchaseTaxInvoiceSource,
  parseAttachmentUrlsJson,
  uniquePositiveIds,
  type PurchaseTaxInvoiceInput,
} from '@/lib/purchase-tax-invoice-core'
import { buildPurchaseTaxInvoiceThaiFilename, buildPurchaseTaxInvoiceThaiWorkbook } from '@/lib/purchase-tax-invoice-xlsx'
import { writeErpXlsxWorkbookToBuffer } from '@/lib/erp-excel-export'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  return headers
}

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status, headers: corsHeaders() })
}

function parseBodyInput(body: Record<string, unknown>, fallbackStore: string): PurchaseTaxInvoiceInput {
  return {
    storeName: String(body.storeName || body.store_name || fallbackStore || '').trim(),
    buyerTaxId: digitsTin13(body.buyerTaxId ?? body.buyer_tax_id),
    docDate: String(body.docDate || body.doc_date || '').slice(0, 10),
    invoiceNo: String(body.invoiceNo || body.invoice_no || '').trim(),
    sellerName: String(body.sellerName || body.seller_name || '').trim(),
    sellerTaxId: digitsTin13(body.sellerTaxId ?? body.seller_tax_id),
    sellerBranch: formatSellerBranch(body.sellerBranch ?? body.seller_branch),
    netAmount: Number(body.netAmount ?? body.net_amount) || 0,
    vatAmount: Number(body.vatAmount ?? body.vat_amount) || 0,
    totalAmount: body.totalAmount != null || body.total_amount != null
      ? Number(body.totalAmount ?? body.total_amount) || 0
      : undefined,
    source: normalizePurchaseTaxInvoiceSource(body.source),
    inboundBatchId:
      body.inboundBatchId != null || body.inbound_batch_id != null
        ? Math.floor(Number(body.inboundBatchId ?? body.inbound_batch_id) || 0) || null
        : null,
    attachmentUrls: parseAttachmentUrlsJson(body.attachmentUrls ?? body.attachment_urls),
    memo: String(body.memo || '').trim(),
  }
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders()
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  try {
    assertCanManageAccountingCompliance(userRole, String(authResult.auth.store || ''))
  } catch {
    return jsonError(403, 'FORBIDDEN')
  }

  const sp = new URL(request.url).searchParams
  const taxMonth = String(sp.get('taxMonth') || sp.get('yearMonth') || '').slice(0, 7)
  const storeFilter = String(sp.get('storeFilter') || 'All').trim() || 'All'
  const exportXlsx = sp.get('export') === 'xlsx' || sp.get('format') === 'xlsx'

  try {
    try {
      await syncInboundBatchPurchaseTaxInvoicesForMonths({
        months: [taxMonth],
        storeFilter,
      })
    } catch (e) {
      console.warn('purchaseTaxInvoices inbound sync:', e)
    }
    const rows = await listPurchaseTaxInvoices({ taxMonth, storeFilter })
    if (exportXlsx) {
      const wb = buildPurchaseTaxInvoiceThaiWorkbook(rows, { taxMonth })
      const buf = await writeErpXlsxWorkbookToBuffer(wb)
      const tin = rows[0]?.buyerTaxId || ''
      const filename = buildPurchaseTaxInvoiceThaiFilename(taxMonth, tin)
      const out = new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers,
      })
      out.headers.set(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      out.headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
      return out
    }
    return NextResponse.json({ success: true, rows }, { headers })
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e || '').toLowerCase()
    if (msg.includes('purchase_tax_invoices') && (msg.includes('does not exist') || msg.includes('42p01'))) {
      return NextResponse.json({ success: true, rows: [], tableMissing: true }, { headers })
    }
    console.error('purchaseTaxInvoices GET:', e)
    return jsonError(500, 'QUERY_FAILED', { message: e instanceof Error ? e.message : String(e) })
  }
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '').trim()
  try {
    assertCanWriteAccountingCompliance(userRole)
  } catch {
    return jsonError(403, 'FORBIDDEN')
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || 'save').trim().toLowerCase()
    const actor = String(auth.name || 'system').trim() || 'system'
    const fallbackStore = String(auth.store || '').trim()

    if (action === 'delete') {
      const id = Math.floor(Number(body.id) || 0)
      if (id <= 0) return jsonError(400, 'ID_REQUIRED')
      await deletePurchaseTaxInvoice(id)
      await writeAccountingComplianceAudit({
        actionType: 'purchase_tax_invoice_delete',
        userRole,
        actor,
        decision: 'allow',
        filingType: 'vat_pp30',
        targetType: 'purchase_tax_invoices',
        targetId: String(id),
      })
      return NextResponse.json({ success: true }, { headers })
    }

    if (action === 'delete_bulk') {
      const ids = uniquePositiveIds(body.ids)
      if (!ids.length) return jsonError(400, 'IDS_REQUIRED')
      const result = await deletePurchaseTaxInvoices(ids)
      await writeAccountingComplianceAudit({
        actionType: 'purchase_tax_invoice_delete_bulk',
        userRole,
        actor,
        decision: 'allow',
        filingType: 'vat_pp30',
        targetType: 'purchase_tax_invoices',
        targetId: String(result.deleted),
      })
      if (result.failed && !result.deleted) {
        return jsonError(500, 'DELETE_FAILED', result)
      }
      return NextResponse.json({ success: true, ...result }, { headers })
    }

    if (action === 'bulk') {
      const rawRows = Array.isArray(body.rows) ? body.rows : []
      const saved: { id: number; invoiceNo: string }[] = []
      const skipped: { invoiceNo: string; reason: string }[] = []
      for (const raw of rawRows) {
        if (!raw || typeof raw !== 'object') continue
        const input = parseBodyInput(raw as Record<string, unknown>, fallbackStore)
        if (!isTin13(input.buyerTaxId) && input.storeName) {
          input.buyerTaxId = await resolveBuyerTaxIdForStore(input.storeName)
        }
        try {
          const row = await upsertPurchaseTaxInvoice(input, { actor })
          saved.push({ id: row.id, invoiceNo: row.invoiceNo })
        } catch (e) {
          if (e instanceof PurchaseTaxInvoiceDuplicateError) {
            skipped.push({ invoiceNo: input.invoiceNo, reason: 'duplicate' })
            continue
          }
          if (e instanceof PurchaseTaxInvoiceSubmittedError) {
            skipped.push({ invoiceNo: input.invoiceNo, reason: 'submitted' })
            continue
          }
          skipped.push({
            invoiceNo: input.invoiceNo,
            reason: e instanceof Error ? e.message : 'save_failed',
          })
        }
      }
      await writeAccountingComplianceAudit({
        actionType: 'purchase_tax_invoice_bulk',
        userRole,
        actor,
        decision: 'allow',
        filingType: 'vat_pp30',
        targetType: 'purchase_tax_invoices',
        targetId: String(saved.length),
      })
      return NextResponse.json({ success: true, saved, skipped }, { headers })
    }

    const input = parseBodyInput(body, fallbackStore)
    if (!isTin13(input.buyerTaxId) && input.storeName) {
      input.buyerTaxId = await resolveBuyerTaxIdForStore(input.storeName)
    }
    const existingId = Math.floor(Number(body.id) || 0) || undefined
    const row = await upsertPurchaseTaxInvoice(input, { actor, existingId })
    await writeAccountingComplianceAudit({
      actionType: existingId ? 'purchase_tax_invoice_update' : 'purchase_tax_invoice_create',
      userRole,
      actor,
      decision: 'allow',
      filingType: 'vat_pp30',
      targetType: 'purchase_tax_invoices',
      targetId: String(row.id),
    })
    return NextResponse.json({ success: true, row }, { headers })
  } catch (e) {
    if (e instanceof PurchaseTaxInvoiceDuplicateError) {
      return jsonError(409, 'DUPLICATE', { existingId: e.existingId })
    }
    if (e instanceof PurchaseTaxInvoiceSubmittedError) {
      return jsonError(409, 'SUBMITTED')
    }
    console.error('purchaseTaxInvoices POST:', e)
    return jsonError(500, 'SAVE_FAILED', { message: e instanceof Error ? e.message : String(e) })
  }
}
