/**
 * 일별 매트릭스 인보이스 → 인쇄 화면 열기 (출고 관리와 동일 데이터)
 */
import {
  getCombinedOutboundHistory,
  getInvoiceData,
  getInvoiceOrderBillToCandidates,
  getInvoiceSettings,
  type HqWarehouseDayInvoice,
} from '@/lib/api-client'
import { buildThaiSalesInvoiceData } from '@/lib/thai-sales-invoice-data'
import {
  resolveInvoiceClientForTarget,
  resolveInvoiceClientFromBillToCandidates,
} from '@/lib/invoice-client-resolve'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import type { InvoiceData } from '@/components/invoice'

export async function openStockDailyMatrixInvoicePrint(
  inv: HqWarehouseDayInvoice,
  startStr: string,
  endStr: string
): Promise<{ ok: boolean; message?: string }> {
  const hist = await getCombinedOutboundHistory({
    startStr,
    endStr,
    vendorFilter: inv.store,
  })
  const lines = hist.filter((h) => {
    if (inv.orderId && h.orderRowId === String(inv.orderId)) return true
    if (inv.invoiceNo && h.invoiceNo === inv.invoiceNo) return true
    return h.date === inv.ymd && h.target === inv.store
  })
  if (!lines.length) {
    return { ok: false, message: 'invoice_lines_not_found' }
  }

  const totalAmt = lines.reduce((s, l) => s + (l.amount || 0), 0)
  const group = {
    date: inv.ymd,
    target: inv.store,
    invoiceNo: inv.invoiceNo,
    totalAmt,
    items: lines,
  }

  const [invoiceDataRes, invSettings] = await Promise.all([getInvoiceData(), getInvoiceSettings()])
  const { company, clients } = invoiceDataRes
  const settings = typeof invSettings === 'object' && invSettings !== null ? invSettings : {}

  const orderIds = inv.orderId && inv.orderId > 0 ? [inv.orderId] : []
  const billToCandRes =
    orderIds.length > 0
      ? await getInvoiceOrderBillToCandidates(orderIds)
      : { map: {}, taxInvoiceClientMap: {} }

  const oid = inv.orderId ?? 0
  const memoClient =
    Number.isFinite(oid) && oid > 0 ? billToCandRes.taxInvoiceClientMap?.[String(oid)] : undefined
  const fromOrder = Number.isFinite(oid) && oid > 0 ? billToCandRes.map?.[String(oid)] : undefined
  const candidates =
    Array.isArray(fromOrder) && fromOrder.length > 0
      ? fromOrder
      : [String(group.target || '').trim()].filter(Boolean)
  const resolvedClient =
    candidates.length > 0
      ? resolveInvoiceClientFromBillToCandidates(candidates, company, clients)
      : resolveInvoiceClientForTarget(group.target || '', company, clients)
  const client = memoClient || resolvedClient

  const docNo = (group.invoiceNo || `IV-${(group.date || '').replace(/\D/g, '')}`).trim()
  const dateStr = (group.date || '').split(' ')[0] || inv.ymd

  const invoiceData: InvoiceData = buildThaiSalesInvoiceData({
    documentType: 'Invoice',
    documentNo: docNo,
    issueDate: dateStr,
    dueDate: dateStr,
    referenceNo: group.invoiceNo || '-',
    company,
    client,
    invSettings: settings,
    sourceRefType: oid > 0 ? 'Order' : undefined,
    sourceRefId: oid > 0 ? oid : undefined,
    lines: (group.items || []).map((it) => ({
      code: it.code,
      name: it.name,
      spec: it.spec,
      lineRemarks: it.lineRemarks?.trim() || undefined,
      qty: Math.abs(it.qty || 0),
      amount: Math.abs(it.amount || 0),
    })),
    orderInvoiceTotals: thaiInvoiceTotalsFromRawSubtotal(group.totalAmt || 0),
  })

  sessionStorage.setItem('invoice-print-data', JSON.stringify([invoiceData]))
  const w = window.open('/admin/invoice-print', '_blank')
  if (!w) return { ok: false, message: 'popup_blocked' }
  return { ok: true }
}
